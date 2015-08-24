(function () {

	app.LineModel = Backbone.Model.extend({
		defaults: {
			type: "content",
			content: "",
			live: false,
			stage: false,
			modified: false
		},
		initialize: function (params) {
			var self = this;

			Object.defineProperty(self, "is_starter", {
				enumerable: true,
				get: function () {
					return ([
						"title",
						"point",
						"music",
						"countdown"
					]).indexOf(self.get("type")) > -1
				}
			});
		}
	});

	app.LineCollection = Backbone.Collection.extend({
		model: app.LineModel,
		comparator : function(model){
			return model.get("order");
		},
		initialize: function () {

			var self = this;

			/*self.on("add", function (model) {
				model.index = function () {
					return self.indexOf(self);
				};

			});*/
			
			self.on("update", function () {
				self.forEach(function (m, i) {
					m.set("order", i);
				});
			});

		}
	});

})();
