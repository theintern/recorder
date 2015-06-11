define(function () {
	function createMockDocument() {
		var elements = {};

		return {
			getElementById: function (id) {
				if (id.indexOf('invalid') > -1) {
					return null;
				}

				if (!elements[id]) {
					elements[id] = { value: '' };
				}

				return elements[id];
			}
		};
	}

	return {
		createWindow: function (platform) {
			return {
				document: createMockDocument(),
				navigator: {
					platform: platform
				}
			};
		}
	};
});
