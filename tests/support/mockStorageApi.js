define(function () {
	return function createMockStorageApi(store) {
		if (!store) {
			store = {};
		}

		return {
			clear: function () {
				store = {};
			},
			key: function (index) {
				return Object.keys(store)[index];
			},
			getItem: function (key) {
				return Object.prototype.hasOwnProperty.call(store, key) && store[key] || null;
			},
			removeItem: function (key) {
				delete store[key];
			},
			setItem: function (key, value) {
				store[key] = value;
			}
		};
	};
});
