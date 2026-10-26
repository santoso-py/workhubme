# Third-party licences

workhubme itself is MIT-licensed (see `LICENSE`). It depends on the packages below, all under permissive licences that allow free use, modification and redistribution. No dependency is paid, copyleft, or source-restricted.

Generated from the installed `package.json` files (October 2026).

| Package | Version | Licence | Role |
|---|---|---|---|
| electron | 44.9.3 | MIT | App runtime (development dependency; downloaded on first run) |
| @xterm/xterm | 6.0.0 | MIT | Terminal emulator in the terminal tab |
| @xterm/addon-fit | 0.11.0 | MIT | Fits the terminal to its pane |
| node-pty | 1.1.0 | MIT | Pseudo-terminal for the login shell |
| node-addon-api | 7.1.1 | MIT | Used by node-pty |
| @electron/get | 5.1.0 | MIT | Downloads the Electron binary |
| @electron-internal/extract-zip | 1.0.6 | MIT | Unpacks the Electron download |
| debug | 4.4.3 | MIT | Installer dependency |
| ms | 2.1.3 | MIT | Installer dependency |
| env-paths | 3.0.0 | MIT | Installer dependency |
| progress | 2.0.3 | MIT | Installer dependency |
| undici | 7.30.1 | MIT | Installer dependency |
| undici-types | 7.24.6 | MIT | Installer dependency |
| @types/node | 24.19.2 | MIT | Type definitions (installer dependency) |
| graceful-fs | 4.2.11 | ISC | Installer dependency |
| semver | 7.8.5 | ISC | Installer dependency |
| sumchecker | 3.0.1 | Apache-2.0 | Installer dependency |

This repository does not redistribute the Electron or Chromium binaries; npm downloads Electron on first run. If you build and share your own application bundle, include Electron's `LICENSE` and Chromium's `LICENSES.chromium.html` from the Electron distribution.

Site names and logos mentioned in the documentation belong to their owners. No third-party logos or artwork are included in this repository.
