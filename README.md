# ![Intern Recorder](https://theintern.github.io/recorder/images/readme-logo.png)

[![CI status](https://travis-ci.org/theintern/recorder.svg)](https://travis-ci.org/theintern/recorder)

The Intern Recorder is a Chrome Developer Tools extension that assists in the creation of functional tests for Web applications by automatically recording user interaction with a browser into a format compatible with the Intern testing framework.

## Support

Please read the [contribution guidelines](https://github.com/theintern/recorder/blob/master/CONTRIBUTING.md) for information on how to get help! New issues and enhancement requests should be submitted to the [main issue tracker](https://github.com/theintern/intern/issues/new?body=Description:%0A%0ASteps+to+reproduce:%0A%0A1.%20%E2%80%A6%0A2.%20%E2%80%A6%0A3.%20%E2%80%A6%0A%0AExpected%20result:%0AActual%20result:%0A%0AIntern%20version:%0ARecorder%20version:%0A%0AAny%20additional%20information:).

## Installation

The latest version of Intern Recorder can be installed for free from the [Chrome Web Store](https://chrome.google.com/webstore/detail/intern-recorder/oalhlikaceknjlnmoombecafnmhbbgna "Intern Recorder on Chrome Web Store").

Development versions can be installed by opening the Extensions tab in Chrome, enabling Developer mode, choosing “Load unpacked extension”, and choosing the directory where the Intern Recorder repository is checked out.

## Usage

The Intern Recorder is a Dev Tools extension, so it can be accessed from Dev Tools. On a tab you wish to record, open Dev Tools, then select the Intern tab.

![Intern UI](https://theintern.github.io/recorder/images/ui.svg)

Start recording actions by clicking the start/stop recording button. The recorder automatically generates a single suite containing all the generated tests for the session.

The clear tests button will remove all previously recorded actions/tests.

The new test button will create a new test.

The save button will save the generated test script to a file.

### Hotkeys

The Recorder also includes configurable hotkeys that can be used to perform common operations during a test recording. These operations are:

* Pause/resume recorder. This is equivalent to clicking the record button in Dev Tools.
* Insert callback. This inserts a `then` command into the script containing an empty callback function.
* Insert move to current mouse position. This inserts a `moveMouseTo` command into the script wherever the mouse is currently positioned.

Note that the hotkeys only work when you are focused on the tab of the page being tested. Pressing the hotkeys when the Dev Tools window is focused will do nothing.

## Configuration

Currently, the only configuration available for the Intern Recorder are the hotkey combinations. Simply click in one of the input fields and press the key combination you’d like to use to configure hotkeys. Hotkey configuration is persisted to local storage.

## Internal architecture

Chrome restricts which extension APIs are available to Dev Tools scripts, so the Recorder is designed using a multi-process architecture:

![Intern UI](https://theintern.github.io/recorder/images/architecture.svg)

The recorder itself is maintained in the background script, which has access to the full Chrome extension API. The user interface is displayed from the Dev Tools page script and communicates with the recorder through a `chrome.runtime` messaging port. To intercept page interaction, the background script injects an event forwarding script into the browser tab that listens for various DOM events and passes them to the recorder through a second `chrome.runtime` messaging port.

## Debugging

* Injected content (eventProxy.js): Errors and console statements will show up directly in Dev Tools for the page being recorded.
* Background script (background.js, Recorder.js): Open the Chrome extensions tab, find Intern Recorder in the list of loaded extensions, and click the “background page” link next to “Inspect views”. This will open a new Dev Tools window for the background script.
* Dev tools page (devtools.html, devtools.js, panel.html, RecorderProxy.js): Open Dev Tools, undock it (using the top right icon, next to Settings, click and hold for drop-down), choose the Intern tab, then open another Dev Tools window. The second Dev Tools window will be inspecting the first Dev Tools window.

## Special thanks

A very special thanks to [SITA](http://www.sita.aero/) for sponsoring work on the first release of the Intern Recorder.

## Licensing

Intern Recorder is a Dojo Foundation project offered under the [New BSD](https://github.com/theintern/recorder/blob/master/LICENSE) license.

© [SitePen, Inc.](http://sitepen.com/) and its [contributors](https://github.com/theintern/recorder/graphs/contributors)
