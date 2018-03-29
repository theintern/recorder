# Intern Recorder

<!-- start-github-only -->
<br><p align="center"><img src="https://cdn.rawgit.com/theintern/recorder/master/docs/logo.svg" alt="Intern Recorder logo" height="128"></p><br>
<!-- end-github-only -->

<!-- start-github-only -->
[![CI status](https://travis-ci.org/theintern/recorder.svg)](https://travis-ci.org/theintern/recorder) <!-- end-github-only --> 
[![Intern](https://theintern.io/images/intern-v4.svg)](https://github.com/theintern/intern/)

The Intern Recorder is a Chrome Developer Tools extension that assists in the
creation of functional tests for Web applications by automatically recording
user interaction with a browser into a format compatible with the Intern
4+ testing framework.

<!-- vim-markdown-toc GFM -->

* [Installation](#installation)
* [Usage](#usage)
  * [Hotkeys](#hotkeys)
  * [Configuration](#configuration)
* [Developing](#developing)
  * [Setup](#setup)
  * [Internal architecture](#internal-architecture)
  * [Debugging](#debugging)
* [Support](#support)
* [Special thanks](#special-thanks)
* [Licensing](#licensing)

<!-- vim-markdown-toc -->

## Installation

The latest version of Intern Recorder can be installed for free from the
[Chrome Web Store].

## Usage

The Intern Recorder is a Dev Tools extension, so it can be accessed from the
Dev Tools panel. On a tab you wish to record, open Dev Tools, then select the
Intern tab.

![Intern UI](https://raw.githubusercontent.com/theintern/recorder/master/docs/usage.png)

Start recording actions by clicking the **start/stop recording** button. The
recorder automatically generates a single suite containing all the generated
tests for the session.

The **clear tests** button will remove all previously recorded actions/tests.

The **new test** button will create a new test.

The **save** button will save the generated test script to a file.

### Hotkeys

The Recorder also includes configurable hotkeys that can be used to perform
common operations during a test recording. These operations are:

* **Pause/resume recorder**. This is equivalent to clicking the record button in
  Dev Tools.
* **Insert callback**. This inserts a `then` command into the script containing an
  empty callback function.
* **Insert <em>move to current mouse position</em>**. This inserts a `moveMouseTo` command
  into the script wherever the mouse is currently positioned.

> 💡 The hotkeys only work when you are focused on the tab of the page
being tested. Pressing the hotkeys when the Dev Tools window is focused will do
nothing.

> 💡 The default hotkeys may not work as expected on your system’s keyboard

### Configuration

Currently, the only configuration available for the Intern Recorder are the
hotkey combinations. Simply click in one of the input fields and press the key
combination you’d like to use to configure hotkeys. Hotkey configuration is
persisted to local storage.

## Developing

### Setup

1. Clone this repository
2. Run `npm install` and `npm build-watch`. This will start a build watcher
   that will update Intern Recorder as you make changes.
3. Opening the Extensions tab in Chrome (`chrome://extensions`)
4. Enable Developer mode with the toggle at the top of the page
5. Choose ‘LOAD UNPACKED’ and select the directory `<recorder_repo>/build`

### Internal architecture

Chrome restricts which extension APIs are available to Dev Tools scripts, so
the Recorder is designed using a multi-process architecture:

![Intern UI](https://theintern.github.io/recorder/images/architecture.svg)

The recorder itself is maintained in the background script, which has access to
the full Chrome extension API. The user interface is displayed from the Dev
Tools page script and communicates with the recorder through a `chrome.runtime`
messaging port. To intercept page interaction, the background script injects an
event forwarding script into the browser tab that listens for various DOM
events and passes them to the recorder through a second `chrome.runtime`
messaging port.

### Debugging

* Injected content (`content.ts`, `EventProxy.ts`): Errors and console
  statements will show up directly in Dev Tools for the page being recorded.
* Background script (`background.ts`, `Recorder.ts`): Open the Chrome
  extensions tab, find Intern Recorder in the list of loaded extensions, and
  click the “background page” link next to “Inspect views”. This will open a
  new Dev Tools window for the background script.
* Dev tools page (`devtools.html`, `devtools.ts`, `panel.html`,
  `RecorderProxy.ts`): Open Dev Tools, undock it (using the top right icon,
  next to Settings), choose the Intern tab, then open another Dev Tools window.
  The second Dev Tools window will be inspecting the first Dev Tools window.

## Support

Any general questions about how to use Intern Recorder should be directed to
[Stack Overflow](https://stackoverflow.com) (using the `intern` tag) or our
[Gitter channel](https://gitter.im/theintern/intern).

If you think you’ve found a bug or have a specific enhancement request, file an
issue in the [issue tracker](https://github.com/theintern/recorder/issues).
Please read the [contribution guidelines](./CONTRIBUTING.md) for more
information.

## Special thanks

A very special thanks to [Built](https://www.getbuilt.com/) for sponsoring the
work to update Recorder for Intern 4!

Continuing thanks to [SITA](https://www.sita.aero/) for sponsoring the first
release of the Intern Recorder and making this tool possible.

<!-- start-github-only -->
## Licensing

Intern Recorder is a JS Foundation project offered under the [New BSD](LICENSE) license.

© [SitePen, Inc.](http://sitepen.com/) and its [contributors](https://github.com/theintern/recorder/graphs/contributors)
<!-- end-github-only -->

[Chrome Web Store]: https://chrome.google.com/webstore/detail/intern-recorder/oalhlikaceknjlnmoombecafnmhbbgna
[contribution guidelines]: ./CONTRIBUTING.md
[main issue tracker]: https://github.com/theintern/intern/issues/new?body=Description:%0A%0ASteps+to+reproduce:%0A%0A1.%20%E2%80%A6%0A2.%20%E2%80%A6%0A3.%20%E2%80%A6%0A%0AExpected%20result:%0AActual%20result:%0A%0AIntern%20version:%0ARecorder%20version:%0A%0AAny%20additional%20information:
