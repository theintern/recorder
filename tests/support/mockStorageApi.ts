export default class MockStorageApi implements Storage {
	store: Store;

	constructor(store?: Store) {
		this.store = store || {};
	}

	get length() {
		if (!this.store) {
			return 0;
		}
		return Object.keys(this.store).length;
	}

	clear() {
		this.store = {};
	}

	key(index: number) {
		return Object.keys(this.store)[index];
	}

	getItem(key: string) {
		return (
			(Object.prototype.hasOwnProperty.call(this.store, key) &&
				this.store[key]) ||
			null
		);
	}

	removeItem(key: string) {
		delete this.store[key];
	}

	setItem(key: string, value: any) {
		this.store[key] = value;
	}

	[key: string]: any;
	[index: number]: string;
}

export interface Store {
	[key: string]: string;
}
