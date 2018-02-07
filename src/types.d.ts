export type Chrome = typeof window.chrome;

export type Strategy = 'xpath' | 'text';

export interface HotKeyDef {
	altKey?: boolean;
	ctrlKey?: boolean;
	metaKey?: boolean;
	shiftKey?: boolean;
	key: string;
}

export interface RecorderPort {
	send(method: string, args: any[]): void;
}

export interface Message {
	method: string;
	args: any[];
}

export interface Command extends Message {
	start: number;
	end: number;
	text: string;
}

export interface Test {
	name: string;
	start: number;
	end: number;
	commands: Command[];
}
