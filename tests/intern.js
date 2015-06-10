define({
	excludeInstrumentation: /\b(?:node_modules|tests)\//,
	loaderOptions: {
		paths: { dojo: 'node_modules/dojo' }
	},
	suites: [ 'tests/unit/Recorder' ]
});
