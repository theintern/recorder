define({
	createMockMethod: function (impl) {
		var method = function () {
			method.calls.push(Array.prototype.slice.call(arguments, 0));
			if (impl) {
				return impl.apply(this, arguments);
			}
		};
		method.calls = [];
		method.clear = function () {
			method.calls.splice(0, Infinity);
		};
		return method;
	},

	mock: function (object, methodName, applyOriginal) {
		var originalMethod = object[methodName];
		var method = object[methodName] = function () {
			method.calls.push(Array.prototype.slice.call(arguments, 0));
			if (applyOriginal) {
				return originalMethod.apply(this, arguments);
			}
		};
		method.calls = [];
		method.clear = function () {
			method.calls.splice(0, Infinity);
		};
		return {
			remove: function () {
				object[methodName] = originalMethod;
				this.remove = function () {};
			}
		};
	}
});
