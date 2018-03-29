import {
	HotKeyDef,
	Message,
	Strategy,
	ChromeLike,
	PanelLike,
	PortLike,
	ButtonLike
} from './types';

export default class RecorderProxy {
	chrome: ChromeLike;
	contentWindow: Window | null;
	panel: PanelLike;
	recording: boolean | undefined;

	_port: PortLike | null;
	_recordButton: ButtonLike | undefined;
	_script: HTMLInputElement | undefined;
	_toggleOnShow: boolean | undefined;

	constructor(chrome: ChromeLike, panel: PanelLike) {
		this.chrome = chrome;
		this.panel = panel;

		this.contentWindow = null;
		this.recording = false;
		this._port = null;

		this._initializeUi();
		this._initializePort();
	}

	_getHotkeyLabel(hotkey: HotKeyDef) {
		let charMap: { [key: string]: string };
		let metaMap: { [key: string]: string };
		let getKey: (hotkey: HotKeyDef) => string;

		function getChar(key: string) {
			return key.slice(0, 2) === 'U+'
				? String.fromCharCode(Number('0x' + key.slice(2))).toUpperCase()
				: null;
		}

		if (this.contentWindow!.navigator.platform === 'MacIntel') {
			metaMap = {
				Alt: '⌥',
				Control: '^',
				Meta: '⌘',
				Shift: '⇧'
			};
			charMap = {
				'U+0008': 'Backspace',
				'U+0009': '↹',
				'U+0020': 'Space',
				'U+001B': '⎋',
				'U+007F': 'Delete',
				Down: '↓',
				Left: '←',
				Right: '→',
				Up: '↑'
			};
			getKey = hotkey => hotkey.key;
		} else {
			metaMap = {
				Alt: 'Alt+',
				Control: 'Ctrl+',
				Meta: 'Win+',
				Shift: 'Shift+'
			};
			charMap = {
				'U+0008': 'Backspace',
				'U+0009': 'Tab',
				'U+0020': 'Space',
				'U+001B': 'Esc',
				'U+007F': 'Del'
			};
			// Chrome on Windows has character layout bugs, see
			// https://code.google.com/p/chromium/issues/detail?id=48111
			// To resolve this for now we just add more maps for the incorrect values on standard US keyboard
			getKey = hotkey => {
				const fixedValues = BAD_KEYS[hotkey.key];
				if (fixedValues) {
					return (
						'U+00' +
						fixedValues
							.charCodeAt(hotkey.shiftKey ? 1 : 0)
							.toString(16)
							.toUpperCase()
					);
				}
				return hotkey.key;
			};
		}

		function getHotkeyLabel(hotkey: HotKeyDef) {
			function append(key: string) {
				key = metaMap[key] || key;
				label += key;
			}

			let label = '';
			const key = getKey(hotkey);
			const char = getChar(key);
			const isLetter = Boolean(char) && char !== char!.toLowerCase();

			if (hotkey.ctrlKey) {
				append('Control');
			}

			if (hotkey.altKey) {
				append('Alt');
			}

			// shifted non-letter keys are identified by their shifted value already, so don’t display the shift
			// modifier if the key is a shifted non-letter (e.g. 1 -> !, 2 -> @)
			if (hotkey.shiftKey && (!char || char === ' ' || isLetter)) {
				append('Shift');
			}

			if (hotkey.metaKey) {
				append('Meta');
			}

			if (key in charMap) {
				append(charMap[key]);
			} else if (char) {
				append(char);
			} else if (!(key in metaMap)) {
				append(key);
			}

			return label;
		}

		this._getHotkeyLabel = getHotkeyLabel;
		return getHotkeyLabel(hotkey);
	}

	_hide() {
		// To avoid recording spurious interaction when a user has switched to another dev tools panel, pause
		// recording automatically when this panel is hidden and resume it when a user switches back
		if (this.recording) {
			this._toggleOnShow = true;
			this.send('toggleState');
		} else {
			this._toggleOnShow = false;
		}
	}

	_initializeHotkeys() {
		const { document } = this.contentWindow!;

		['insertCallback', 'insertMouseMove', 'toggleState'].forEach(id => {
			const input = document.getElementById('hotkey-' + id);

			/* istanbul ignore if: the recorder is broken if this ever happens */
			if (!input) {
				throw new Error(
					'Panel is missing input for hotkey "' + id + '"'
				);
			}

			input.onkeydown = event => {
				event.preventDefault();
				this.send('setHotkey', [id, getHotkey(event)]);
			};
		});
	}

	_initializeOptions() {
		const { document } = this.contentWindow!;
		const suiteNameInput = document.getElementById('option-suite-name');
		const strategyInput = document.getElementById('option-strategy');
		const customAttrInput = document.getElementById(
			'option-custom-attribute'
		);

		/* istanbul ignore if: the recorder is broken if this ever happens */
		if (!suiteNameInput) {
			throw new Error('Panel is missing input for suite name');
		}

		/* istanbul ignore if: the recorder is broken if this ever happens */
		if (!strategyInput) {
			throw new Error('Panel is missing input for option "strategy"');
		}

		/* istanbul ignore if: the recorder is broken if this ever happens */
		if (!customAttrInput) {
			throw new Error(
				'Panel is missing input for custom attribute option'
			);
		}

		suiteNameInput.oninput = event => {
			this.send('setSuiteName', [(<HTMLInputElement>event.target).value]);
		};

		strategyInput.onchange = event => {
			this.send('setStrategy', [(<HTMLInputElement>event.target).value]);
		};

		customAttrInput.oninput = event => {
			this.send('setCustomAttribute', [
				(<HTMLInputElement>event.target).value
			]);
		};

		const findInput = document.getElementById('option-findDisplayed');

		/* istanbul ignore if: the recorder is broken if this ever happens */
		if (!findInput) {
			throw new Error(
				'Panel is missing input for option "findDisplayed"'
			);
		}

		findInput.onchange = event => {
			this.send('setFindDisplayed', [
				(<HTMLInputElement>event.target).checked
			]);
		};
	}

	_initializePort() {
		this._port = this.chrome.runtime.connect(this.chrome.runtime.id, {
			name: 'recorderProxy'
		});
		this._port.onMessage.addListener(message => {
			const msg = <Message>message;
			const method = <keyof RecorderProxy>msg.method;
			if (!this[method]) {
				throw new Error(
					`Method "${method}" does not exist on RecorderProxy`
				);
			}

			(<Function>this[method])(...(msg.args || []));
		});
		this._port.postMessage({
			method: 'setTabId',
			args: [this.chrome.devtools.inspectedWindow.tabId]
		});
	}

	_initializeScript() {
		const script = <HTMLInputElement>this.contentWindow!.document.getElementById(
			'script'
		);

		/* istanbul ignore if: the recorder is broken if this ever happens */
		if (!script) {
			throw new Error('Panel is missing output for script');
		}

		this._script = script;

		const _this = this;
		script.oninput = function(this: any) {
			_this.send('setScript', [this.value]);
		};
	}

	_initializeUi() {
		const panel = this.panel;
		const controls: {
			action: string;
			button: [string, string, boolean];
		}[] = [
			{
				action: 'toggleState',
				button: [
					'resources/statusBarIcons/record_off.png',
					'Record',
					false
				]
			},
			{
				action: 'clear',
				button: ['resources/statusBarIcons/clear.png', 'Clear', false]
			},
			{
				action: 'newTest',
				button: [
					'resources/statusBarIcons/newTest.png',
					'New test',
					false
				]
			},
			{
				action: 'save',
				button: ['resources/statusBarIcons/save.png', 'Save', false]
			}
		];

		controls.forEach(control => {
			const button = panel.createStatusBarButton(
				control.button[0],
				control.button[1],
				control.button[2]
			);
			button.onClicked.addListener(() => {
				this.send(control.action);
			});

			if (control.action === 'toggleState') {
				this._recordButton = button;
			}
		});

		panel.onShown.addListener(this._show.bind(this));
		panel.onHidden.addListener(this._hide.bind(this));
	}

	send(method: string, args?: any[]) {
		this._port!.postMessage({ method: method, args: args });
	}

	setFindDisplayed(value: boolean) {
		if (this.contentWindow) {
			(<HTMLInputElement>this.contentWindow!.document.getElementById(
				'option-findDisplayed'
			)!).checked = value;
		}
	}

	setHotkey(id: number | string, hotkey: HotKeyDef) {
		if (!this.contentWindow) {
			return;
		}

		const input = <HTMLInputElement>this.contentWindow.document.getElementById(
			'hotkey-' + id
		);

		if (!input) {
			throw new Error('Panel is missing input for hotkey "' + id + '"');
		}

		input.value = this._getHotkeyLabel(hotkey);
	}

	setRecording(value: boolean) {
		this.recording = value;
		this._recordButton!.update(
			'resources/statusBarIcons/record_' + (value ? 'on' : 'off') + '.png'
		);
	}

	setScript(value: string) {
		if (this._script && value != null) {
			this._script.value = value;
		}
	}

	setStrategy(value: Strategy) {
		if (this.contentWindow) {
			(<HTMLInputElement>this.contentWindow!.document.getElementById(
				'option-strategy'
			)).value = value;
		}
	}

	setCustomAttribute(value: string) {
		if (this.contentWindow) {
			(<HTMLInputElement>this.contentWindow!.document.getElementById(
				'option-custom-attribute'
			)).value = value;
		}
	}

	_show(contentWindow: Window) {
		if (this.contentWindow !== contentWindow) {
			this.contentWindow = contentWindow;
			this._getHotkeyLabel = RecorderProxy.prototype._getHotkeyLabel;
			this._initializeScript();
			this._initializeHotkeys();
			this._initializeOptions();
		}

		if (this._toggleOnShow) {
			this.send('toggleState');
		}

		this.send('refreshUi');
	}
}

function getHotkey(event: KeyboardEvent) {
	const hotkey: HotKeyDef = <HotKeyDef>{};

	['altKey', 'ctrlKey', 'key', 'metaKey', 'shiftKey'].forEach(key => {
		hotkey[<keyof HotKeyDef>key] = <any>event[<keyof KeyboardEvent>key];
	});

	return hotkey;
}

const BAD_KEYS: { [key: string]: string } = {
	'U+00BA': ';:',
	'U+00BB': '=+',
	'U+00BC': ',<',
	'U+00BD': '-_',
	'U+00BE': '.>',
	'U+00BF': '/?',
	'U+00DB': '[{',
	'U+00DC': '\\|',
	'U+00DD': ']}',
	'U+00C0': '`~',
	'U+00DE': '\'"'
};
