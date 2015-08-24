(function (socket) {

	/*	Socket Callback
	--------------------------------------*/
		var response_handlers = {};

		var qcid = 0,
			question_callbacks = new Backbone.Collection();

		function request (params) {
			qcid++;
			var cb = question_callbacks.add({
					id: qcid,
					success: params.success,
					error: params.error || function (er) { throw new Error("Could not process request", er); }
				});
			socket.emit("request", {
				i: qcid,
				q: params.query,
				d: params.data
			});
		}

		app.request = request;

		socket.on("response", function (response) {
			var cb = question_callbacks.find({id:response.i});
			if (response.e)
				cb.get("error").call(app, response.e);
			else
				cb.get("success").call(app, response.d);

			// clean it up!
			question_callbacks.remove(cb);
		});

		socket.on("request", function (query) {
			var response = {i:query.i};

			//console.log('query: ', query);

			if (response_handlers[query.q])
			{
				var data;
				try {
					data = response_handlers[query.q].call(app, query.d);
				} catch (er) {
					response.e = "response failed";
				}
				response.d = data;
			} else {
				response.e = "no such question found";
			}

			if (response)
			{
				//console.log("responding to question '" + query.q + "', " + JSON.stringify(response.d, null, 4));
				socket.emit("response", response);
			}
		});


	response_handlers.mode = function () {
		return "controller";
	};


	app.LineView = Backbone.View.extend({
		tagName: 'div',
		className: 'line',
		active_attribute: null,
		initialize: function (params) {
			var self = this,
				model = self.model;

			self.active_attribute = params.active_attribute;

			for (var key in self.match)
				model.on("change:"+key, self.match[key], self);
			
			model.on("change", function () {
				socket.emit("update", [{
					i: model.get("order"),
					d: model.changedAttributes()
				}]);
			});

			model.on("remove", function () {
				self.$el.slideUp("fast", function () {
					$(this).remove();
				});
			});
		},

		match: {
			content: function () {
				var self = this;
				console.log("Matching content");

				this.$el.find(".content").html(this.model.get("content"));
			},
			type: function () {
				console.log("Matching type");

				var self = this,
					$el = self.$el,
					desired_classname = self.model.get("type").toLowerCase(),
					classes = $el.attr("class");
				_.forEach(classes.split(' '), function (classname) {
					if (classname.indexOf("type-") === 0 && classname !== desired_classname)
						$el.removeClass(classname);
				});
				$el.addClass("type-" + desired_classname);
				$el.find("[data-value=type]").val(desired_classname);
			},
			live: function () {
				var val = this.model.get("live");
				console.log("Matching live: ", val);
				this.$el.find("[data-value=live]")[val ? "addClass" : "removeClass"]("active");
			},
			stage: function () {
				var val = this.model.get("stage");
				console.log("Matching stage: ", val);
				this.$el.find("[data-value=stage]")[val ? "addClass" : "removeClass"]("active");
			},
			modified: function () {
				var val = this.model.get("modified");
				console.log("Matching modified: ", val);
				this.$el[val ? "addClass" : "removeClass"]("modified");
			}
		},

		render: function () {
			var self = this,
				$el = self.$el,
				model = self.model,
				collection = model.collection;

			console.group("Rendering " + this.model.get("content"));

			$el.html($("#template").html());

			$el.find("div.content").on("keydown", function (ev) {
				var kc = ev.keyCode;
				//console.log(ev);
				switch (kc)
				{
					case 13: // enter
						if ( ! ev.shiftKey)
						{
							acceptInput();
							ev.preventDefault();
						}
						break;

					case 27: // esc
						$(this).html(model.get("content"));
						model.set("modified", false);
						break;
				}
			});

			$el.find("[data-action=publish]").on("click", acceptInput);

			function acceptInput ()
			{
				model.set("content", $el.find("div.content").html());
				model.set("modified", false);
			}

			$el.find("div.content").on("input", function () {
				
				$(this).find("*")
					.removeAttr("class")
					.removeAttr("style")
					.each(function () {
						if ($(this).is(":empty"))
							$(this).remove();
					});

				model.set("modified", true);
			});

			$el.find("[data-value=type]").on("change", function () {
				model.set("type", $(this).val());
			});

			$el.find("[data-action=insert-below]").on("click", function () {
				var my_order = model.get("order"),
					new_data = {
						order: my_order
					};
				collection.add(new_data);
				socket.emit("add-slide", new_data);
			});

			$el.find("[data-action=remove]").on("click", function () {
				var my_order = model.get("order");
				_.forEach(collection.filter(function (m) {
					return m.get("order") > my_order;
				}), function (m) {
					m.set("order", m.get("order") - 1);
				});
				
				socket.emit("remove-slide", model.get("order"));
				collection.remove(model);
				console.log("removed");
			});

			$el.find("[data-value=live]").on("click", function () {
				model.set("live", ! model.get("live"));

				if (model.get("live"))
				{

					var prev_title = null,
						post_title = null,
						model_index = model.get("order"),
						prev_titles = collection.filter(function (m) {
							return m.is_starter && m.get("order") <= model_index;
						}),
						post_titles = collection.filter(function (m) {
							return m.is_starter && m.get("order") > model_index;
						});

					if (prev_titles.length > 0)
					{
						prev_title = prev_titles[prev_titles.length-1];

						if (prev_title.get("order") !== model.get("order"))
							prev_title.set("live",true);

						_.forEach(collection.models.slice(0,prev_title.get("order")), function (m) {
							m.set("live", false);
						});
					}
					
					if (post_titles.length > 0)
					{
						post_title = post_titles[0];

						_.forEach(collection.models.slice(post_title.get("order")), function (m) {
							m.set("live", false);
						});
					}
				}

			});

			$el.find("[data-value=stage]").on("click", function () {
				model.set("stage", ! model.get("stage"));
			});

			$el.find("[data-value=solo]").on("click", function () {
				model.set("live", true);

				_.forEach(collection.models.slice(0,model.get("order")), function (m) {
					m.set("live", false);
				});

				_.forEach(collection.models.slice(model.get("order")+1), function (m) {
					m.set("live", false);
				});
			});

			_.forEach(this.match, function (fn) {
				fn.call(self);
			});
			console.groupEnd();
			return this;
		}
	});

	app.LineCollectionView = Backbone.View.extend({
		el: '#lines',
		className: 'line-wrapper',
		active_attribute: "live",
		initialize: function (params) {

			this.collection.on("add", this.appendView, this);

			this.collection.on("sort", this.render, this);

		},
		appendView: function (model) {
			var self = this,
				line_view = new app.LineView({
					model:model,
					active_attribute: self.active_attribute
				});
			self.$el.append(line_view.$el);
			line_view.render();
		},
		render: function () {
			var self = this;
			self.$el.empty();
			self.collection.forEach(function (line_model) {
				self.appendView(line_model);
			});
			return self;
		}
	});



	var line_collection = new app.LineCollection(),
		lines_view = new app.LineCollectionView({
			collection: line_collection
		});

	$("body").append(lines_view.$el);
	lines_view.render();

	app.line_collection = line_collection;
	app.lines_view = lines_view;


	app.socket.on("update", function (data) {
		_.forEach(data, function (updates) {
			app.line_collection.models[updates.i].set(updates.d);
		});
	});

	app.socket.on("set-slides", function (data) {
		console.group("Setting slides");

		console.log(data);

		app.line_collection.set(data);

		console.groupEnd();
	});



	// Keep Last
	$(function () {
		app.request({
			query: "slides",
			success: function (data) {
				console.group("Setting slides");
				console.log(data);
				app.line_collection.set(data);
				console.groupEnd();
			}
		});

		$("[data-action=save]").on("click", function () {
			socket.emit("save");
			$(this).html("saving&hellip;");
		});

		socket.on("saved", function () {
			$("[data-action=save]").html("save");
		});

		socket.on("save-error", function () {
			$("[data-action=save]").html("error");
		});
	});

})(app.socket);