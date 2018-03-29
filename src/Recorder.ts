import {
	ChromeLike,
	PortLike,
	HotKeyDef,
	Message,
	RecorderPort,
	Strategy,
	Test
} from './types';

export default class Recorder {
	chrome: ChromeLike;
	storage: Storage;
	hotkeys: HotKeys;
	strategy: Strategy;
	findDisplayed: string | false;
	recording: boolean;
	tabId: number | undefined | null;

	_currentModifiers: { [modifier: string]: boolean };
	_currentTest: Test | null;
	_findCommand: 'findDisplayedByXpath' | 'findByXpath';
	_ignoreKeyups: { [key: string]: boolean };
	_lastMouseMove: RecorderMouseEvent | null;
	_lastTarget: Element | null;
	_lastTargetFrame: number[];
	_lastTestId: 0;
	_recordNextMouseMove: boolean;
	_suiteName: string | undefined;

	// connects to an EventProxy instance representing the web page that the devtools are open for
	_contentPort: RecorderPort | null;

	// connects to a RecorderProxy instance representing the "Intern" panel in Chrome devtools
	_port: RecorderPort | null;

	_script: string;
	_scriptTree: Test[];

	constructor(chrome?: ChromeLike, storage?: Storage) {
		if (chrome == null) {
			throw new Error('Chrome API must be provided to recorder');
		}

		if (storage == null) {
			throw new Error('Storage API must be provided to recorder');
		}

		this.chrome = chrome;
		this.storage = storage;

		const storedKeys = storage.getItem('intern.hotkeys');
		this.hotkeys = storedKeys
			? JSON.parse(storedKeys)
			: this._getDefaultHotkeys();

		this.strategy = <Strategy>storage.getItem('intern.strategy') || 'xpath';
		this.findDisplayed = storage.getItem('intern.findDisplayed') || false;

		this.recording = false;
		this.tabId = null;
		this._findCommand = 'findByXpath';

		this._initializeScript();
		this._initializePort();
		this._initializeNavigation();
		this.clear();
	}

	clear() {
		this._currentModifiers = {};
		this._currentTest = null;
		this._lastMouseMove = null;
		this._lastTarget = null;
		this._lastTargetFrame = [];
		this._lastTestId = 0;
		this._ignoreKeyups = {};
		this._script = '';
		this._scriptTree = [];
		this._suiteName = 'recorder-generated suite';

		if (this.tabId) {
			this.newTest();
		}
	}

	_eraseKeys(numKeys: number) {
		const commands = this._currentTest!.commands;
		const lastCommand = commands[commands.length - 1];

		if (numKeys === lastCommand.args[0].length) {
			this._eraseLast(1);
			return;
		}

		lastCommand.args[0] = lastCommand.args[0].slice(0, -numKeys);
		lastCommand.text = createCommandText(
			lastCommand.method,
			lastCommand.args
		);
		lastCommand.end = lastCommand.start + lastCommand.text.length;

		this._renderScriptTree();
	}

	_eraseLast(numCommands: number) {
		const commands = this._currentTest!.commands;
		commands.splice(commands.length - numCommands, numCommands);
		this._renderScriptTree();
	}

	_eraseThrough(methodName: string) {
		const commands = this._currentTest!.commands;

		let index = commands.length - 1;
		while (index > -1 && commands[index].method !== methodName) {
			--index;
		}

		/* istanbul ignore else: guard for condition that should not occur unless there is a bug */
		if (index > -1) {
			commands.splice(index, Infinity);
			this._renderScriptTree();
		}
	}

	_getDefaultHotkeys() {
		return {
			insertCallback: {
				altKey: true,
				shiftKey: true,
				key: /* c */ 'U+0043'
			},
			insertMouseMove: {
				altKey: true,
				shiftKey: true,
				key: /* m */ 'U+004D'
			},
			toggleState: { altKey: true, shiftKey: true, key: /* p */ 'U+0050' }
		};
	}

	_getDefaultPort() {
		return {
			send: function() {}
		};
	}

	_handleHotkeyEvent(event: RecorderKeyboardEvent) {
		if (event.type !== 'keydown') {
			return;
		}

		const ignoreKeyupMap = this._ignoreKeyups;
		function ignore(key: string) {
			ignoreKeyupMap[key] = true;
		}

		nextKey: for (const hotkeyId in this.hotkeys) {
			const hotkey = this.hotkeys[<keyof HotKeys>hotkeyId];

			// All hotkey modifiers must be checked even if they are not in the incoming data to avoid false
			// activation, e.g. Ctrl+Home should not activate a hotkey Home
			for (const key in {
				altKey: true,
				ctrlKey: true,
				metaKey: true,
				shiftKey: true
			}) {
				if (
					Boolean(event[<keyof RecorderEvent>key]) !==
					Boolean(hotkey[<keyof HotKeyDef>key])
				) {
					continue nextKey;
				}
			}

			if (event.key !== hotkey.key) {
				continue nextKey;
			}

			if (!this.recording && hotkeyId !== 'toggleState') {
				return;
			}

			ignore(hotkey.key);

			let numKeysToErase = 0;

			[
				['altKey', 'Alt'],
				['ctrlKey', 'Control'],
				['metaKey', 'Meta'],
				['shiftKey', 'Shift']
			].forEach(key => {
				if (
					hotkey[<keyof HotKeyDef>key[0]] &&
					this._currentModifiers[key[1]]
				) {
					ignore(key[1]);
					delete this._currentModifiers[key[1]];
					++numKeysToErase;
				}
			});

			if (numKeysToErase) {
				this._eraseKeys(numKeysToErase);
			}

			(<Function>this[<keyof Recorder>hotkeyId])();

			return true;
		}

		return false;
	}

	_initializePort() {
		// two ports are received, one from the event proxy (injected page script) and one from the recorder proxy
		// (devtools panel script)
		this.chrome.runtime.onConnect.addListener(port => {
			const receiveMessage = (message: object, _port: PortLike) => {
				const msg = <Message>message;
				const method = <keyof Recorder>msg.method;
				if (!this[method]) {
					throw new Error(
						`Method "${method}" does not exist on Recorder`
					);
				}

				(<Function>this[method])(...(msg.args || []));
			};

			const disconnect = () => {
				port.onMessage.removeListener(receiveMessage);
				port.onDisconnect.removeListener(disconnect);

				if (port.name === 'recorderProxy') {
					this._port = this._getDefaultPort();
					this.recording = false;
				} else if (port.name === 'eventProxy') {
					/* istanbul ignore else: there are only two port types */
					this._contentPort = this._getDefaultPort();
				}
			};

			port.onMessage.addListener(receiveMessage);
			port.onDisconnect.addListener(disconnect);

			if (port.name === 'recorderProxy') {
				this._port = {
					send(method: string, args: any[]) {
						return port.postMessage({ method: method, args: args });
					}
				};

				this.refreshUi();
			} else if (port.name === 'eventProxy') {
				/* istanbul ignore else: there are only two port types */
				this._contentPort = {
					send: function(method, args) {
						return port.postMessage({ method: method, args: args });
					}
				};

				this._contentPort.send('setStrategy', [this.strategy]);
			}
		});

		this._contentPort = this._getDefaultPort();
		this._port = this._getDefaultPort();
	}

	_initializeNavigation() {
		const handleNavigation = (
			detail: chrome.webNavigation.WebNavigationTransitionCallbackDetails
		) => {
			// frameId !== 0 is a subframe; we could try navigating these if we
			// could figure out what the entry for the subframe was for a
			// `switchToFrame` call
			if (
				!this.recording ||
				detail.tabId !== this.tabId ||
				detail.frameId !== 0
			) {
				return;
			}

			if (detail.transitionType === 'reload') {
				this._recordTarget(null);
				this._record('refresh');
			} else if (
				detail.transitionQualifiers.indexOf('forward_back') !== -1
			) {
				// Chrome does not specify whether it was forward button or back button so for now we simply
				// re-enter the url; this will not correctly test bfcache but will at least ensure we end up back
				// on the correct page. We could try to guess which way it went by recording tab history but this
				// would only work if the two surrounding pages are not the same
				this._recordTarget(null);
				this._record('get', [detail.url]);
			} else if (
				detail.transitionQualifiers.indexOf('from_address_bar') !== -1
			) {
				this._recordTarget(null);
				this._record('get', [detail.url]);
			}

			this._injectContentScript();
			this._renderScriptTree();
		};

		this.chrome.webNavigation.onCommitted.addListener(handleNavigation);
		this.chrome.webNavigation.onReferenceFragmentUpdated.addListener(
			handleNavigation
		);
		this.chrome.webNavigation.onHistoryStateUpdated.addListener(
			handleNavigation
		);
	}

	_initializeScript() {
		this._script = '';
		this._scriptTree = [];
	}

	_injectContentScript() {
		this.chrome.tabs.executeScript(this.tabId!, {
			file: 'lib/EventProxy.js',
			allFrames: true
		});
		this.chrome.tabs.executeScript(this.tabId!, {
			file: 'lib/content.js',
			allFrames: true
		});
	}

	insertCallback() {
		if (!this.recording) {
			return;
		}

		this._record('then', [FUNCTION_OBJECT]);
		this._renderScriptTree();
	}

	insertMouseMove() {
		if (!this.recording || !this._lastMouseMove) {
			return;
		}

		const event = this._lastMouseMove!;

		this._recordTarget(event);
		this._record('moveMouseTo', [event.elementX, event.elementY], 1);
		this._renderScriptTree();
	}

	newTest() {
		if (!this.tabId) {
			throw new Error('Cannot add new test due to missing tabId');
		}

		if (this._currentTest) {
			if (this._lastTarget) {
				this._record('end', null, 1);
			}
			if (this._lastTargetFrame.length) {
				this._record('switchToFrame', [anyNull]);
			}
			this._lastTarget = null;
			this._lastTargetFrame = [];
		}

		const test: Test = {
			name: `Test ${++this._lastTestId}`,
			commands: [],
			start: 0,
			end: 0
		};

		this._currentTest = test;
		this._scriptTree.push(test);

		this.chrome.tabs.get(this.tabId, tab => {
			this._record('get', [tab.url]);
			this._renderScriptTree();
		});
	}

	recordEvent(event: RecorderEvent) {
		if (this._handleHotkeyEvent(<RecorderKeyboardEvent>event)) {
			return;
		}

		if (!this.recording) {
			return;
		}

		const mouseEvent = <RecorderMouseEvent>event;
		const keyboardEvent = <RecorderKeyboardEvent>event;

		switch (event.type) {
			case 'click':
				this._eraseThrough('pressMouseButton');
				// moveMouseTo
				this._eraseLast(1);

				// moveMouseTo is recorded on click and dblclick instead of using the already-recorded moveMouseTo
				// from the previous mousedown/mouseup because there may be a slight difference in position due to
				// hysteresis
				this._record(
					'moveMouseTo',
					[mouseEvent.elementX, mouseEvent.elementY],
					1
				);
				this._record('clickMouseButton', [mouseEvent.button], 1);
				break;

			case 'dblclick':
				// click (2), click (2)
				this._eraseThrough('clickMouseButton');
				this._eraseThrough('clickMouseButton');
				// mouseMoveTo
				this._eraseLast(1);

				// moveMouseTo is recorded on click and dblclick instead of using the already-recorded moveMouseTo
				// from the previous mousedown/mouseup because there may be a slight difference in position due to
				// hysteresis
				this._record(
					'moveMouseTo',
					[mouseEvent.elementX, mouseEvent.elementY],
					1
				);
				this._record('doubleClick', null, 1);
				break;

			case 'keydown':
				if (isModifierKey(keyboardEvent.key)) {
					this._currentModifiers[keyboardEvent.key] = true;
				}

				this._recordKey(keyboardEvent);
				break;

			case 'keyup':
				if (this._ignoreKeyups[keyboardEvent.key]) {
					delete this._ignoreKeyups[keyboardEvent.key];
					delete this._currentModifiers[keyboardEvent.key];
					return;
				}

				if (isModifierKey(keyboardEvent.key)) {
					delete this._currentModifiers[keyboardEvent.key];
					this._recordKey(keyboardEvent);
				}
				break;

			case 'mousedown':
				this._recordTarget(mouseEvent);
				this._record(
					'moveMouseTo',
					[mouseEvent.elementX, mouseEvent.elementY],
					1
				);
				this._record('pressMouseButton', [mouseEvent.button], 1);
				// The extra mouse move works around issues with DnD implementations like dojo/dnd where they
				// require at least one mouse move over the source element in order to activate
				this._recordNextMouseMove = true;
				break;

			case 'mousemove':
				this._lastMouseMove = mouseEvent;
				if (this._recordNextMouseMove) {
					this._recordNextMouseMove = false;
					this.insertMouseMove();
				}
				break;

			case 'mouseup':
				this._recordNextMouseMove = false;
				this._recordTarget(mouseEvent);
				this._record(
					'moveMouseTo',
					[mouseEvent.elementX, mouseEvent.elementY],
					1
				);
				this._record('releaseMouseButton', [mouseEvent.button], 1);
				break;
		}

		this._renderScriptTree();
	}

	_record(method: string, args?: any[] | null, indent?: number) {
		const test = this._currentTest!;
		const commands = test.commands;

		const text = createCommandText(method, args, indent);
		const start =
			commands.length > 0
				? commands[commands.length - 1].end
				: test.start;

		if (commands.length === 0 && method === 'get' && args) {
			const url = args[0];
			const page = url.replace(/\/$/, '').slice(url.lastIndexOf('/') + 1);
			this.setSuiteName(page);
		}

		commands.push({
			text: text,
			method: method,
			args: args || [],
			start: start,
			end: start + text.length
		});

		this._renderScriptTree();
	}

	_recordKey(event: RecorderKeyboardEvent) {
		const suppressesShift = (key: string) => {
			const code = key.charCodeAt(0);
			if (code >= 0xe000 && code <= 0xf8ff) {
				return false;
			}

			return key.toUpperCase() === key;
		};

		const key = getSeleniumKey(event.key, event.location, event.shiftKey);

		const commands = this._currentTest!.commands;
		const lastCommand = commands[commands.length - 1];
		const indent = this._lastTarget ? 1 : 0;

		if (lastCommand && lastCommand.method === 'pressKeys') {
			const shiftKey = getSeleniumKey('Shift', 0, true);
			const args = lastCommand.args;
			const lastKey = args[0].charAt(args[0].length - 1);

			// if the previous character was a Shift to start typing this
			// uppercase letter, remove the Shift from the output since it is
			// encoded in our use of an uppercase letter
			if (suppressesShift(key) && lastKey === shiftKey) {
				args[0] = args[0].slice(0, -1);
			} else if (
				event.type === 'keyup' &&
				key === shiftKey &&
				suppressesShift(lastKey)
			) {
				// if the previous character was an uppercase letter and this
				// key is a Shift release, do not add the Shift release; it
				// will be encoded in the next letter
				return;
			}

			args[0] += key;

			lastCommand.text = createCommandText(
				lastCommand.method,
				args,
				indent
			);
			lastCommand.end = lastCommand.start + lastCommand.text.length;
		} else {
			this._record('pressKeys', [key], indent);
		}
	}

	_recordTarget(event: RecorderMouseEvent | null) {
		const checkTargetFrameChanged = () => {
			if (evt.targetFrame.length !== lastTargetFrame.length) {
				return true;
			}

			for (let i = 0, j = lastTargetFrame.length; i < j; ++i) {
				if (evt.targetFrame[i] !== lastTargetFrame[i]) {
					return true;
				}
			}

			return false;
		};

		const evt = event || { target: null, targetFrame: <number[]>[] };
		const lastTargetFrame = this._lastTargetFrame;
		const targetFrameChanged = checkTargetFrameChanged();
		const targetChanged = evt.target !== this._lastTarget;

		if (targetFrameChanged || targetChanged) {
			if (this._lastTarget) {
				this._record('end', null, 1);
			}

			if (targetFrameChanged) {
				if (lastTargetFrame.length) {
					this._record('switchToFrame', [anyNull]);
				}
				evt.targetFrame.forEach(frameId => {
					this._record('switchToFrame', [frameId]);
				});
				this._lastTargetFrame = evt.targetFrame;
			}

			if (evt.target) {
				this._record(this._findCommand, [evt.target]);
			}

			this._lastTarget = <Element>evt.target;
		}
	}

	refreshUi() {
		const port = this._port!;
		port.send('setFindDisplayed', [this.findDisplayed]);
		port.send('setScript', [this._script]);
		port.send('setRecording', [this.recording]);
		port.send('setStrategy', [this.strategy]);

		for (const hotkeyId in this.hotkeys) {
			port.send('setHotkey', [
				hotkeyId,
				this.hotkeys[<keyof HotKeys>hotkeyId]
			]);
		}
	}

	_renderScriptTree() {
		const script = [
			templates.suiteOpen.replace('$NAME', this._suiteName!),
			this._scriptTree
				.map(test =>
					[
						templates.testOpen.replace('$NAME', test.name),
						...test.commands.map(command => command.text),
						templates.testClose
					].join('')
				)
				.join('\n'),
			templates.suiteClose
		];

		this.setScript(script.join(''));
	}

	save() {
		const file = new Blob([this._script], {
			type: 'application/ecmascript'
		});
		const url = URL.createObjectURL(file);

		this.chrome.downloads.download(
			{
				filename: `${url.slice(url.lastIndexOf('/') + 1)}.js`,
				url,
				saveAs: true
			},
			function() {
				URL.revokeObjectURL(url);
			}
		);
	}

	setFindDisplayed(value: boolean) {
		const valueStr = value ? 'true' : 'false';
		this.storage.setItem('intern.findDisplayed', valueStr);
		this._findCommand = value ? 'findDisplayedByXpath' : 'findByXpath';
	}

	setHotkey(hotkeyId: keyof HotKeys, hotkey: HotKeyDef) {
		this.hotkeys[hotkeyId] = hotkey;
		this._port!.send('setHotkey', [hotkeyId, hotkey]);
		this.storage.setItem('intern.hotkeys', JSON.stringify(this.hotkeys));
	}

	setScript(value: string) {
		this._script = value;
		this._port!.send('setScript', [value]);
	}

	setSuiteName(value: string) {
		this._suiteName = value || 'recorder-generated suite';
		this._renderScriptTree();
	}

	setStrategy(value: Strategy) {
		if (value !== 'xpath' && value !== 'text') {
			throw new Error(`Invalid search strategy "${value}"`);
		}

		this.storage.setItem('intern.strategy', value);
		this.strategy = value;
		this._contentPort!.send('setStrategy', [value]);
	}

	setTabId(tabId: number) {
		if (tabId && this.tabId !== tabId) {
			this.tabId = tabId;
			this.clear();
		}
	}

	toggleState() {
		if (!this.tabId) {
			throw new Error('Cannot update state due to missing tabId');
		}

		if (!this.recording) {
			this._injectContentScript();
		}

		this.recording = !this.recording;
		this._port!.send('setRecording', [this.recording]);
	}
}

export interface RecorderEvent {
	type: string;
	targetFrame: number[];
}

export interface RecorderMouseEvent extends RecorderEvent {
	elementX: number;
	elementY: number;
	button: number;
	buttons: number;
	target: string | Element;
}

export interface RecorderKeyboardEvent extends RecorderEvent {
	key: string;
	location: number;
	ctrlKey: boolean;
	shiftKey: boolean;
}

export interface HotKeys {
	insertCallback: HotKeyDef;
	insertMouseMove: HotKeyDef;
	toggleState: HotKeyDef;
}

const FUNCTION_OBJECT = {
	toString() {
		return '() => {}';
	}
};

function createCommandText(
	method: string,
	args?: any[] | null,
	indent?: number
) {
	let text = `\n${getIndent(3)}${getIndent(indent)}.${method}(`;

	if (args && args.length) {
		args.forEach((arg, index) => {
			if (index > 0) {
				text += ', ';
			}

			if (typeof arg === 'string') {
				text += `'${arg.replace(/'/g, "\\'")}'`;
			} else if (arg === anyNull) {
				text += '<any>null';
			} else {
				text += String(arg);
			}
		});
	}

	text += ')';
	return text;
}

function getIndent(num = 0) {
	let indent = '';
	while (num-- > 0) {
		indent += '  ';
	}
	return indent;
}

const KEY_MAP = {
	// Backspace
	'U+0008': '\ue003',
	// Tab
	'U+0009': '\ue004',
	// Space
	'U+0020': ' ',
	// Escape
	'U+001B': '\ue00c',
	// Delete
	'U+007F': '\ue017',
	Cancel: '\uE001',
	Help: '\uE002',
	Backspace: '\uE003',
	Tab: '\uE004',
	Clear: '\uE005',
	Return: '\uE006',
	Enter: '\uE007',
	Shift: '\uE008',
	Control: '\uE009',
	Alt: '\uE00A',
	Pause: '\uE00B',
	Escape: '\uE00C',
	Space: ' ',
	PageUp: '\uE00E',
	PageDown: '\uE00F',
	End: '\uE010',
	Home: '\uE011',
	ArrowLeft: '\uE012',
	ArrowUp: '\uE013',
	ArrowRight: '\uE014',
	ArrowDown: '\uE015',
	Insert: '\uE016',
	Delete: '\uE017',
	F1: '\uE031',
	F2: '\uE032',
	F3: '\uE033',
	F4: '\uE034',
	F5: '\uE035',
	F6: '\uE036',
	F7: '\uE037',
	F8: '\uE038',
	F9: '\uE039',
	F10: '\uE03A',
	F11: '\uE03B',
	F12: '\uE03C',
	Meta: '\uE03D',
	Command: '\uE03D',
	ZenkakuHankaku: '\uE040'
};

// Chrome on Windows has character layout bugs, see
// https://code.google.com/p/chromium/issues/detail?id=48111
// To resolve this for now there are some extra key maps below in the range of U+0041 to U+0090 that only
// apply to Windows users
const NUMPAD_KEY_MAP = {
	// ;
	'U+003B': '\uE018',
	// =
	'U+003D': '\uE019',
	// 0
	'U+0030': '\uE01A',
	'U+0060': '\uE01A',
	// 1
	'U+0031': '\uE01B',
	'U+0041': '\uE01B',
	// 2
	'U+0032': '\uE01C',
	'U+0042': '\uE01C',
	// 3
	'U+0033': '\uE01D',
	'U+0043': '\uE01D',
	// 4
	'U+0034': '\uE01E',
	'U+0044': '\uE01E',
	// 5
	'U+0035': '\uE01F',
	'U+0045': '\uE01F',
	// 6
	'U+0036': '\uE020',
	'U+0046': '\uE020',
	// 7
	'U+0037': '\uE021',
	'U+0047': '\uE021',
	// 8
	'U+0038': '\uE022',
	'U+0048': '\uE022',
	// 9
	'U+0039': '\uE023',
	'U+0049': '\uE023',
	// *
	'U+002A': '\uE024',
	'U+004A': '\uE024',
	// +
	'U+002B': '\uE025',
	'U+004B': '\uE025',
	// ,
	'U+002C': '\uE026',
	'U+004C': '\uE026',
	// -
	'U+002D': '\uE027',
	'U+004D': '\uE027',
	// .
	'U+002E': '\uE028',
	'U+004E': '\uE028',
	// /
	'U+002F': '\uE029',
	'U+004F': '\uE029'
};

function getSeleniumKey(
	key: string,
	keyLocation: number,
	isUpperCase: boolean
) {
	const numPadKey = <keyof typeof NUMPAD_KEY_MAP>key;
	if (keyLocation === /* numpad */ 3 && NUMPAD_KEY_MAP[numPadKey]) {
		return NUMPAD_KEY_MAP[numPadKey];
	}

	const keyKey = <keyof typeof KEY_MAP>key;
	if (KEY_MAP[keyKey]) {
		return KEY_MAP[keyKey];
	}

	/* istanbul ignore else: should be impossible */
	if (key.slice(0, 2) === 'U+') {
		const char = String.fromCharCode(Number(`0x${key.slice(2)}`));
		return isUpperCase ? char.toUpperCase() : char.toLowerCase();
	} else {
		return key;
	}
}

const modifiers: { [key: string]: boolean } = {
	Shift: true,
	Control: true,
	Alt: true,
	Meta: true
};

function isModifierKey(key: string) {
	return Boolean(modifiers[key]);
}

const templates = {
	suiteOpen: [
		"const { suite, test } = intern.getPlugin('interface.tdd');",
		'',

		"// Uncomment the line below to use chai's 'assert' interface.",
		"// const { assert } = intern.getPlugin('chai');",

		'',

		"// Export the suite to ensure that it's built as a module rather",
		'// than a simple script.',
		"export default suite('$NAME', () => {"
	].join('\n'),
	testOpen: ['', "  test('$NAME', tst => {", '    return tst.remote'].join(
		'\n'
	),
	testClose: [';', '  });'].join('\n'),
	suiteClose: ['', '});', ''].join('\n')
};

const anyNull = {};
