# 昼夜领地对战服务器部署指南

## 当前状态

项目已经支持通过 HTTPS 域名打开网页，并通过同一域名的 WSS 地址进行双人房间联机。实际服务器尚未操作；执行上线前必须先把本文中的 game.example.com、服务器账号和目录替换为真实值，并检查服务器现有反向代理配置。

如果原域名已经承载网站，优先使用独立子域名，例如 game.example.com。当前应用按站点根路径使用 /、/healthz 和 /ws；直接放到 example.com/game/ 子目录还需要额外的路径改造。

## 软著申请前的公开切流提醒

[中国版权保护中心《计算机软件著作权登记申请表填写说明》](https://www.ccopyright.com.cn/index.php?optionid=1081)明确把“网上发布”列为软件发表方式之一，并要求已发表软件填写首次发表日期和地点。

本项目申请指南中的发表状态目前仍是待确认字段。因此，在申请人确认“已发表/未发表”和首次发表日期之前，不要把游戏无访问控制地向公众开放。建议先在 HTTPS 下使用 Basic Auth 或 IP 白名单完成内部验收；解除访问限制、正式公开的日期应留存发布记录，并由申请人按真实情况填报。若边界仍不确定，应在公开前咨询中国版权保护中心或专业律师。

## 部署拓扑

~~~
浏览器
  │  HTTPS / WSS
  ▼
Nginx 80/443
  │  HTTP / WebSocket Upgrade
  ▼
Node.js 127.0.0.1:8080
~~~

Node 进程同时提供静态网页和 WebSocket 中继。房间状态保存在单个 Node 进程内存中，因此必须使用单实例运行；不能直接启用 PM2 cluster 或多个后端副本。

## 上线前需要确认

1. 真实域名或子域名。
2. 服务器 SSH 地址、登录用户和 sudo 权限，或宝塔等面板类型。
3. Linux 发行版和版本。
4. 当前使用 Nginx、Caddy、Apache、Docker、宝塔还是其他入口。
5. 原网站是否必须保留，以及 80、443、8080 端口当前由谁占用。
6. DNS 是否有 A 和 AAAA 记录；若保留 AAAA，IPv6 必须也能到达这台服务器。

在未知现有配置时，不要覆盖 /etc/nginx/nginx.conf，也不要删除原站点配置。

## 一、本地生成服务器发布包

在项目根目录执行：

~~~
npm test
npm run check:android-assets
npm run package:server
npm run check:server-release
~~~

发布目录为：

~~~
dist/server-release/
~~~

它只包含运行所需的网页、Node 服务、第三方许可、部署模板和 SHA256SUMS，不包含 .git、软著申请材料、Android 工程、APK、测试或开发记录。

## 二、DNS

推荐新增子域名 A 记录：

~~~
主机记录：game
记录类型：A
记录值：服务器公网 IPv4
~~~

仅当服务器已正确配置公网 IPv6 时才添加 AAAA 记录。DNS 生效后可检查：

~~~
dig +short game.example.com A
dig +short game.example.com AAAA
~~~

## 三、服务器只读预检

登录服务器后先检查，不要立即修改：

~~~
cat /etc/os-release
command -v node
node --version
command -v nginx
sudo nginx -T
sudo ss -ltnp
sudo systemctl --failed
~~~

建议 Node.js 18 或更新的长期支持版本。记录 nginx -T 输出中与目标域名、80、443 有关的现有 server 块，避免重名和冲突。

## 四、上传发布目录

建议使用专用目录和低权限用户：

~~~
sudo useradd --system --home /srv/day-night-territory-battle --shell /usr/sbin/nologin pongwars
sudo install -d -o pongwars -g pongwars -m 0750 /srv/day-night-territory-battle
~~~

从本机把 dist/server-release/ 中的内容上传到 /srv/day-night-territory-battle/。正式覆盖前先备份服务器上的旧版本；不要把整个 Git 仓库设置成 Nginx 静态目录。

上传后在服务器验证：

~~~
cd /srv/day-night-territory-battle
sha256sum --check SHA256SUMS
/usr/bin/node --check server.js
~~~

## 五、配置 Node 服务

把 deploy/game.env.example 复制为：

~~~
/etc/day-night-territory-battle.env
~~~

然后把 GAME_PUBLIC_ORIGINS 改为真实 HTTPS Origin。它必须包含协议，不能包含路径：

~~~
NODE_ENV=production
PORT=8080
GAME_BIND_HOST=127.0.0.1
GAME_PUBLIC_ORIGINS=https://game.example.com
~~~

多个正式入口使用英文逗号分隔，例如：

~~~
GAME_PUBLIC_ORIGINS=https://game.example.com,https://www.game.example.com
~~~

不要配置星号通配符。Node 只监听 127.0.0.1，公网不应直接开放 8080。

把 deploy/day-night-territory-battle.service.example 复制到：

~~~
/etc/systemd/system/day-night-territory-battle.service
~~~

先核对 /usr/bin/node 是否为服务器真实 Node 路径，再执行：

~~~
sudo systemctl daemon-reload
sudo systemctl enable --now day-night-territory-battle
sudo systemctl status day-night-territory-battle
sudo journalctl -u day-night-territory-battle -n 100 --no-pager
curl --fail --silent http://127.0.0.1:8080/healthz
~~~

健康检查应返回：

~~~
{"ok":true}
~~~

## 六、配置 HTTPS 与 WebSocket 反向代理

最终 Nginx 模板位于 deploy/nginx-game.conf.example。先把其中所有 game.example.com 替换为真实域名。

如果证书尚不存在，不要直接启用引用 Let’s Encrypt 证书路径的最终模板。先创建仅监听 80 的最小 server 块，让域名能够到达本机，再使用服务器现有证书流程或 Certbot 申请证书：

~~~
sudo certbot --nginx -d game.example.com
~~~

证书存在后安装最终模板，再检查并平滑重载：

~~~
sudo nginx -t
sudo systemctl reload nginx
~~~

模板已包含：

- HTTP 到 HTTPS 跳转。
- /ws 的 WebSocket Upgrade 头。
- 长连接等待超时。
- 每 IP 握手速率和并发连接限制。
- /healthz 代理。
- 基础安全响应头。

服务器防火墙和云安全组只需对公网开放 80、443；SSH 端口按现有管理策略开放。8080 应保持仅本机可达。

## 七、上线验收

依次验证：

1. https://game.example.com/ 返回游戏页面。
2. https://game.example.com/healthz 返回 200 和 {"ok":true}。
3. 浏览器开发者工具中没有 Mixed Content、WebSocket 403 或 JavaScript 异常。
4. 联机模式提示“自动使用加密 WSS”，不再显示服务器内网 IP。
5. 两个独立浏览器或两台设备分别创建和加入同一个 4 位房间。
6. 房主与访客完成移动、普通技能、激光、暂停、恢复、重开和离开后的重新加入。
7. 服务重启后网页恢复，但重启前的房间会断开，这是当前单进程内存架构的预期行为。

若 WSS 返回 403，优先检查：

- GAME_PUBLIC_ORIGINS 是否与浏览器地址栏的协议、域名和端口完全一致。
- systemd 修改环境文件后是否执行了 restart。
- Nginx 是否保留了浏览器原始 Origin。
- DNS 是否访问到了正确服务器。

## 八、回滚

上线前保留上一版发布目录和 Nginx 配置副本。新版本异常时：

1. 恢复上一版运行目录。
2. 恢复上一版站点配置。
3. 执行 nginx -t。
4. 重启 Node 服务并平滑重载 Nginx。
5. 重新检查本机和公网 /healthz。

不要在没有备份和 nginx -t 成功结果时覆盖或删除现有站点配置。

## 九、当前边界

- 房间码为 4 位数字，无账号和比赛身份认证，适合轻量娱乐对战。
- 房间仅存在单进程内存，服务重启会中断对战。
- 公网域名中继失败时不会静默回退到第三方 PeerJS；页面会明确提示安全联机服务不可用。
- Android APK 仍保留局域网 IP 连接方式；网站上线不会自动把 APK 改成公网域名客户端。
- 若未来需要多实例、不中断升级或大量并发，应把房间状态和消息中继迁移到共享服务。
