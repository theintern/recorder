export type Method<F extends Function> = F & {
	calls: any[];
	clear(): void;
};

export function createMockMethod<T extends Function = () => void>(
	impl?: T
): Method<T> {
	const method = <Method<T>>(<any>function(this: any) {
		method.calls.push(Array.prototype.slice.call(arguments, 0));
		if (impl) {
			return impl.apply(this, arguments);
		}
	});
	method.calls = [];
	method.clear = () => {
		method.calls.splice(0, Infinity);
	};
	return method;
}

export function mock<T extends object, M extends keyof T>(
	obj: T,
	methodName: M,
	applyOriginal = false
) {
	const originalMethod = obj[methodName];
	const method = (obj[methodName] = <Method<T[M]>>function(this: any) {
		method.calls.push(Array.prototype.slice.call(arguments, 0));
		if (applyOriginal) {
			return (<any>originalMethod).apply(this, arguments);
		}
	});
	method.calls = [];
	method.clear = () => {
		method.calls.splice(0, Infinity);
	};
	return {
		method,
		remove() {
			obj[methodName] = originalMethod;
			this.remove = () => {};
		}
	};
}

export function pullFromArray<T>(arr: T[], item: T) {
	const index = arr.indexOf(item);
	if (index !== -1) {
		arr.splice(index, 1);
	}
}
