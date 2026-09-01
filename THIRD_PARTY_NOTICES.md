# 第三方软件与许可说明

本项目包含或衍生自下列第三方软件。其版权归原权利人所有；本项目对第三方组件的使用不改变相应开源许可。软著鉴别材料源码清单不包含独立第三方包 `vendor/peerjs.min.js`，也不重复计算 Android `assets/www` 中的 Web 源码副本。材料列示总行数不等同于申请人独创代码行数。

## Pong Wars

- 项目：https://github.com/vnglst/pong-wars
- 权利人：Copyright (c) 2024 Koen van Gilst
- 许可：MIT License
- 用途：玩法与基础网格碰撞概念的上游作品；本项目在其基础上进行了较大幅度改写与扩展。
- 许可全文：`LICENSES/PONG_WARS-MIT.txt`

## PeerJS 1.5.4

- 项目：https://github.com/peers/peerjs
- 权利人：Copyright (c) 2015 Michelle Bu and Eric Zhang
- 许可：MIT License
- 用途：`vendor/peerjs.min.js`，在局域网 WebSocket 不可用时提供互联网 P2P 备用传输。
- 许可全文：`LICENSES/PEERJS-MIT.txt`

PeerJS 的浏览器包还包含其构建依赖：`@msgpack/msgpack 2.8.x`（ISC）、`eventemitter3 4.0.x`（MIT）、`peerjs-js-binarypack 2.1.x`（MIT）和 `webrtc-adapter 9.0.x`（BSD-3-Clause）。相应声明汇总于 `LICENSES/PEERJS-BUNDLED-DEPENDENCIES.txt`。

## AndroidX WebKit 1.17.0

- 项目：https://developer.android.com/jetpack/androidx/releases/webkit
- 许可：Apache License 2.0
- 用途：Android `WebViewAssetLoader`，以受控应用资源域加载 APK 内置 Web 页面。
- 许可全文：`LICENSES/APACHE-2.0.txt`

本文件仅用于履行第三方声明与版本追踪，不构成对申请人权利归属的判断。
