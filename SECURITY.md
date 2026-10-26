# Security policy

## Reporting a vulnerability

Please use GitHub's private reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. Do not open a public issue for a security problem.

This is a small, early project maintained in spare time. Reports are handled on a best-effort basis with no response-time guarantee.

## What is in scope

- A way for a web page in a site tab to reach the terminal, the main process, or another tab's data
- A way to bypass a tab's allowed-host rules (navigation, redirects, popups)
- A way to send input to the terminal from anything other than the terminal page
- A `services.json` that makes a tab do more than the validation intends
- Anything that makes the app send data off the machine on its own

## What is not

- The terminal being able to run commands. That is its purpose; it runs your login shell with your privileges.
- Problems in the sites you pin, or in Electron and Chromium themselves. Update Electron (`npm update electron`) and report upstream.
- Services refusing sign-in from an embedded browser.

## Supported versions

Only the latest commit on `main`. There is no auto-update; keep Electron current yourself.
