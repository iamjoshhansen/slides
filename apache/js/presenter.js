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
					error: params.error
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
		return "presenter";
	};


	function setScale ()
	{
		var scale = window.innerWidth / 1920;
		scale *= 62.5;
		console.log("Setting the scale", scale);
		$("html").css({
			"font-size": scale + "%"
		});
	}


	app.LineView = Backbone.View.extend({
		tagName: 'div',
		className: 'line hidden',
		active_attribute: null,
		initialize: function (params) {
			var self = this;

			this.active_attribute = params.active_attribute;

			this.model.on("change:content", this.match.content, this);
			this.model.on("change:type", this.updateType, this);
			this.model.on("change:" + self.active_attribute, this.match.active, this);

			this.model.on("remove", function () {
				self.model.set(self.active_attribute, false);
				self.once("hidden", function () {
					self.$el.remove();
				});
			});
		},

		updateType: function () {
			var self = this,
				was_active = self.model.get(self.active_attribute);

			self.once("hidden", function () {
				console.log("They were hidden!");
				self.match.type.call(self);

				if (was_active)
					self.model.set(self.active_attribute, true);

			});

			self.model.set(self.active_attribute, false);
		},

		match: {
			content: function () {
				console.log("Matching content");
				this.$el.html(this.model.get("content"));
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
			},
			active: function () {
				console.log("Matching active");
				var self = this,
					$el = self.$el,
					model = self.model;

				if (model.get(self.active_attribute)) {

					$el
						.stop()
						.removeAttr("style")
						.removeClass("animated")
						.removeClass("hidden")
						.addClass("invisible");


					var height = $el.height();

						
					$el
						.removeClass("invisible")
						.css({
							height: "0",
							opacity: "0"
						});

					$el
						.animate({
							height: height+"px"
						},{
							duration: 250
						});

					$el
						.animate({
							opacity: "1"
						},{
							duration: 250,
							complete: function () {
								$el
									.removeAttr("style")
									.addClass("animated");
							}
						});

				} else {
					$el.removeClass("animated");
					
					$el
						.stop()
						.animate({
							opacity: 0
						},{
							duration: 250
						});

					$el
						.animate({
							height: 0
						},{
							duration: 250,
							complete: function () {
								$el
									.addClass("animated")
									.addClass("hidden");
								
								self.trigger("hidden");
							}
						});
				}
			}
		},

		render: function () {
			var self = this;
			console.group("Rendering " + this.model.get("content"));
			_.forEach(this.match, function (fn) {
				fn.call(self);
			});
			console.groupEnd();
			return this;
		}
	});

	app.LineCollectionView = Backbone.View.extend({
		tagName: 'div',
		className: 'line-wrapper',
		active_attribute: "live",
		initialize: function (params) {
			
			this.collection.on("add", this.appendView, this);

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
			self.collection.forEach(function (line_model) {
				self.appendView(line_model);
			});
			return self;
		}
	});



	var line_collection = new app.LineCollection([
				{
					type: "title",
					content: "Josh's Presentation App",
					live: true
				},{
					type: "content",
					content: "connecting&hellip;",
					live: true
				}
			]),
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

	app.socket.on("remove-slide", function (index) {
		var model = app.line_collection.find(function (m) {
				return m.get("order") === index;
			});
		app.line_collection.remove(model);
	});

	socket.on("add-slide", function (data) {
		console.log("Got a new slide from socket");
		app.line_collection.add(data);
	});

	app.socket.on("set-slides", function (data) {
		console.group("Setting slides");

		console.log(data);

		app.line_collection.set(data);

		console.groupEnd();
	});




	// Keep last
	$(function () {
		setScale();

		$(window).on("resize", setScale);

		app.request({
			query: "slides",
			success: function (data) {
				console.group("Setting slides");
				console.log(data);
				app.line_collection.set(data);
				console.groupEnd();
			}
		});
	});

})(app.socket);