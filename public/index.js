$(function(){
	var $app = $('#app').height(window.innerHeight);
	var $page = $app.find('#page');
	var $device_list = $app.find('#navigator #device-list');
	var $dashboard = $app.find('#dashboard');
	var $components = $('#components');

	var graphs = {};
	var templates = {};

	$app.splitter({orientation: 'horizontal', limit: 200});

	if (window.location.hostname != '127.0.0.1' && window.location.hostname != 'localhost')
		$('.top-menu').remove();
	else
		updateTemplates();

	$.ajax({
		method: 'GET',
		url: '/device',
		dataType: 'json',
		success: function (devices) {
			devices.forEach(setDevice);

			updateDashboard();
		}
	});

	$app.on('click', '#page-close', function() {
		$page.empty();
	});

	$app.on('click', '#device-list li', function(e) {
		$page.empty();

		var $e = $(this);
		if ($e.hasClass('active') && !!e.originalEvent)
			return $e.removeClass('active');
	
		var device_id = $e.attr('id');
		$.ajax({
			method: 'GET',
			url: '/device/' + device_id + '/varbind-list',
			dataType: 'json',
			success: function(varbind_list) {
				var $component = $components.find('#page-device-view').clone();
				$component.find('.top-menu').find('#device-edit, #device-clone, #device-remove').attr('device-id', device_id);
				$component.appendTo($page);

				$device_list.find('li.active').removeClass('active');
				$device_list.find('li#' + device_id).addClass('active');

				if (!varbind_list.length) 
					return $component.find('#page-content').html('There are no varbinds.');

				var $varbind_list = $('<table/>').attr('id', 'varbind-list').attr('device-id', device_id).data('varbind-list', varbind_list);
				$.each(varbind_list, function (i, varbind) {
					$('<tr/>')
						.attr('id', varbind.id)
						.append($('<td id = "td-name"/>').html(varbind.name))
						.append($('<td id = "td-value"/>').html(cast(varbind.value_type, varbind.value)))
						.append($('<td id = "td-history"/>').attr('value-type', varbind.value_type))
						.appendTo($varbind_list);
				});
				$varbind_list.appendTo($component.find('#page-content'));

				$varbind_list.trigger('update-graphs');
			}
		});
	});

	$page.on('update-graphs', '#page-device-view #varbind-list', function (event, data) {
		var $varbind_list = $(this);
		var varbind_list = $varbind_list.data('varbind-list');

		$.ajax({
			method: 'GET',
			url: '/device/' + $varbind_list.attr('device-id') + '/varbind-history',
			data: {
				from: data && data.period && data.period[0],
				to: data && data.period && data.period[1]
			},	
			success: function (res) {
				if (!res.rows.length)
					return;

				$.each(varbind_list, function(i, varbind) {
					var idx = res.columns.indexOf('varbind' + varbind.id)
					if (idx == -1)
						return;

					deleteGraph(varbind.id);
					var data = res.rows.map((row) => [(varbind.value_type == 'number') ? new Date(row[0]) : row[0], row[idx]]);
					if (data.length == 0)
						return;

					var $cell = $varbind_list.find('tr#' + varbind.id + ' #td-history').empty().attr('is-number', varbind.value_type == 'number');

					if (varbind.value_type != 'number') {
						createRangeSelector().appendTo($cell);

						var packed = []
						data.map(function (e, j, arr) {
							return {
								time: e[0],
								value: e[1],
								prev: arr[j - 1] && arr[j - 1][1] == e[1],
								next: arr[j + 1] && arr[j + 1][1] == e[1]
							}
						}).filter((e) => !e.prev || !e.next).forEach(function(e, j, arr) {
							if (!e.prev && !e.next)
								packed.push({from: e.time, to: e.time, value: e.value});

							if (!e.prev && e.next)
								packed.push({from: e.time, to: arr[j + 1].time, value: e.value});	
						});
						var $table = $('<table/>');
						if (packed.length > 0) {
							packed.forEach((e) => createHistoryTableRow(e, varbind.value_type).appendTo($table));
							$table.data('last-event', packed[packed.length - 1]);
						}
						
						
						$table.appendTo($cell);	
						return;
					}

					var opts = {
						animatedZooms: true,
						valueRange: getRange(data),
						labels: ['time', 'value'],
						highlightCircleSize: 2,					
						height: 100,
						axes: {
							x: {valueFormatter: (ms) => cast('datetime', ms)}
						},
						drawPoints: true,
						plugins : [Dygraph.Plugins.RangeSelector]
					};
				
					graphs[varbind.id] = new Dygraph($cell.get(0), data, opts);
				})
			}
		})		
	})

	$app.on('click', '.top-menu .device-add', function() {
		var $e = $(this);
		$page.empty();
		var $component = $components.find('#page-device-edit').clone(true, true);
		setVarbindList($component, $e.data('template') || []);

		$component.find('#protocols input:radio:first').prop('checked', true);
		$component.appendTo($page);				
	});

	$app.on('click', '#page-close, .device-add, #device-scan', function() {
		$device_list.find('li.active').removeClass('active');
	});

	$page.on('click', '.top-menu #device-edit, .top-menu #device-clone', function() {
		var $e = $(this);
		$.ajax({
			method: 'GET',
			url: '/device/' + $e.attr('device-id'),
			success: function (device) {
				$page.empty();
				var $component = $components.find('#page-device-edit').clone(true, true);
				if ($e.attr('id') == 'device-edit') {
					$component.find('#id').val(device.id);
					$component.find('#name').val(device.name);
					$component.find('#ip').val(device.ip);
					$component.find('#mac').val(device.mac);
					$component.find('#period').val(device.period);
					$component.find('#description').val(device.description);
					$component.find('#is-ping')[device.is_ping ? 'attr' : 'removeAttr']('checked', true);
		
				} else {
					$component.find('#id').attr('cloned', device.id);
					$component.find('#name').val(device.name + ' clone');
				}
				$component.find('#tags').val(device.tags);
		
				for (var protocol in device.protocols) {
					$component
						.find('#protocols #page-' + protocol)
						.find('input, select')
						.each((i, e) => $(e).val(device.protocols[protocol] && device.protocols[protocol][e.id]));
				}
				
				setVarbindList($component, device.varbind_list);

				$component.find('#protocols input:radio:first').prop('checked', true);
				$component.appendTo($page);	
				highlightProtocolTabs();
			}
		})	
	});

	$page.on('change', '#page-device-edit .varbind-list #if', function() {
		$(this).attr('if', this.value)
	});

	$page.on('change', '#page-device-edit .varbind-list input', function() {
		$(this).closest('table.varbind-list').attr('changed', true);
	});

	function setVarbindList($component, varbind_list) {
		console.log($component)
		var $vb_table = $components.find('#block-varbind-list-edit .varbind-list');

		$component.find('#protocols div[id^="page-"]').each(function(i, e) {
			var $e = $(e);
			var protocol = e.id.substring(5);
			var $varbind_list = $vb_table.clone().attr('protocol', protocol);
			var $template_row = $varbind_list.find('#template-row');
			$template_row.find('#td-address').html($components.find('#partial-varbind-address-' + protocol).html());
			
			$.each(varbind_list, function(i, varbind) {
				if (varbind.protocol != protocol)
					return;

				var $row = $template_row.clone(true, true).removeAttr('id');
				$row.attr('id', varbind.id);
				$row.find('#name').val(varbind.name);	
				$.each(varbind.address || {}, (key, value) => $row.find('#td-address #' + key).val(value).attr('value', value));
				$row.find('#divider').val(varbind.divider);
				$row.find('#value-type').val(varbind.value_type || 'string');
				$cond_template_row = $components.find('#partial-varbind-condition');
			
				var $condition_list = $row.find('#td-status-conditions #condition-list');
				$.each(varbind.status_conditions || [], function(i, status_condition) {
					var $condition = $cond_template_row.clone().removeAttr('id');
					$condition.find('#if').val(status_condition.if).attr('if', status_condition.if);
					$condition.find('#value').val(status_condition.value);
					$condition.find('#status').val(status_condition.status);
					$condition.appendTo($condition_list);
				});

				$row.find('#tags').val(varbind.tags);
				$row.appendTo($varbind_list);
			});

			$varbind_list.insertAfter($e.find('#protocol-params'));
		});
	}

	function getVarbindList(templated) {
		var varbind_list = [];
		$page.find('.varbind-list').each(function(i, e) {
			$varbind_list = $(e);
			var protocol = $varbind_list.attr('protocol');
			$varbind_list.find('tbody tr').each(function(j, row) {
				var $row = $(row);
				var varbind = {
					protocol: protocol,
					id: $row.attr('id'),
					name: $row.find('#name').val(),
					divider: $row.find('#divider').val(),
					value_type: $row.find('#value-type').val(),
					tags: $row.find('#tags').val()	
				}
				
				var address = {};
				$row.find('#td-address').find('input, select').each(function() {
					address[this.id] = this.value;	
				});
				
				var status_conditions = [];
				$row.find('#td-status-conditions .status-condition').each(function() {
					var $cond = $(this);	
					status_conditions.push({
						if: $cond.find('#if').val(),
						value: $cond.find('#value').val(),
						status: $cond.find('#status').val()
					});
				});

				if (templated) {
					delete varbind.id;
					varbind.address = address;
					varbind.status_conditions = status_conditions;
				} else {
					varbind.json_address = JSON.stringify(address);
					varbind.json_status_conditions = JSON.stringify(status_conditions);
				}
			
				varbind_list.push(varbind);
			})
		})
		
		return varbind_list;	
	}

	$page.on('click', '.top-menu #device-save', function() {
		var $props = $page.find('#page-content #properties');
		var $protocols = $page.find('#page-content #protocols'); 

		var data = {
			id: $props.find('#id').val(),
			name: $props.find('#name').val(),
			description: $props.find('#description').val(),
			ip: $props.find('#ip').val(),
			period: $props.find('#period').val(),
			mac: $props.find('#mac').val(),
			tags: $props.find('#tags').val(),
			is_ping: $props.find('#is-ping:checked').length
		};

		var protocol_params = {};
		$protocols.find('input:radio[name="tab"]').each(function(i, e) {
			var protocol = e.id.substring(4); // tab-#protocol
			var params = {};
			$protocols.find('#page-' + protocol + ' #protocol-params').find('input, select').each(function(i, param) {
				params[param.id] = param.value;
			})
			protocol_params[protocol] = params;
		})
		data.json_protocols = JSON.stringify(protocol_params);
		data.json_varbind_list = JSON.stringify(getVarbindList());
		
		$.ajax({
			method: 'POST',
			url: '/device',
			data: data,
			dataType: 'text',
			success: function (id) {
				data.id = id;
				setDevice(data).click();
			}
		})
	});

	$page.on('click', '.top-menu #device-save-cancel', function() {
		var id = $page.find('#page-content #properties #id');
		var $e = $device_list.find('li#' + (id.val() || id.attr('cloned') || 0));

		return ($e.length > 0) ? $e.click() : $page.empty();
	});

	$page.on('click', '#page-device-edit #template-save', function() {
		var name = $page.find('#page-device-edit #properties #name').val();
		if (!name)
			return alert('The name is empty');

		if (templates[name] && !confirm('Overwrite?'))
			return;

		$.ajax({
			method: 'POST',
			url: '/template/' + name,
			data: {
				varbind_list: JSON.stringify(getVarbindList(true))
			},
			success: (res) => console.log(res)
		});
	});

	$app.on('click', '#navigator #template-remove', function(event) {
		event.stopPropagation();

		var $e = $(this).closest('div[name]');

		$.ajax({
			method: 'DELETE',
			url: '/template/' + $e.attr('name'),
			success: () => $e.remove()
		});
	});

	$page.on('click', '#page-device-edit .varbind-list #varbind-add', function() {
		var $table = $(this).closest('.varbind-list');
		$table.find('#template-row').clone().removeAttr('id').appendTo($table.find('tbody'));
		highlightProtocolTabs();
	});

	$page.on('click', '#page-device-edit .varbind-list #varbind-remove', function() {
		$(this).closest('tr').remove();
		highlightProtocolTabs();	
	});

	$page.on('click', '#page-device-edit #condition-add', function() {
		$components.find('#partial-varbind-condition').clone().removeAttr('id').appendTo($(this).parent().find('#condition-list'));
	});	

	$page.on('click', '#page-device-edit #condition-remove', function() {
		$(this).parent().remove();
	});

	$page.on('click', '#page-device-edit .varbind-list #td-value', function() {
		var $row = $(this).closest('tr');
		var data = {
			protocol: $row.closest('table').attr('protocol'),
			protocol_params: {ip: $page.find('#ip').val()},
			address: {},
			divider: $row.find('#divider').val()
		}
		$row.closest('div[id^="page-"]').find('#protocol-params').find('input, select').each((i, param) => data.protocol_params[param.id] = param.value);
		$row.find('#td-address').find('input, select').each((i, param) => data.address[param.id] = param.value);
	
		$.ajax({
			method: 'GET',
			url: '/value',
			data: {
				json_opts: JSON.stringify(data)
			},
			success: function(res) {
				$row.find('#td-value').html(cast($row.find('#value-type').val(), res) + '<br>&#10227;')
			}
		})
	});

	$page.on('click', 'details', function() {
		var $e = $(this);
		if ($e.find('div').html())
			return;
		
		$.ajax({
			method: 'GET',
			url: $e.attr('url'),
			success: (res) => $e.find('div').html(res)
		})	
	});

	$page.on('click', '#page-device-view #device-remove', function() {
		var id = $(this).attr('device-id');
		$.ajax({
			method: 'DELETE',
			url: '/device/' + id,
			success: function() {
				$device_list.find('#' + id).remove();
				$page.empty();
			}
		})
	});

	$app.on('click', '.top-menu #device-scan', function() {
		$page.empty();
		var $page_scan = $components.find('#page-device-scan').clone().appendTo($page);

		$page_scan.find('#range').focus();

		$template = $page_scan.find('#template-row select#template');
		$template.find('option:not([value=""])').remove();
		$.each(templates, function (name, data) {
			$('<option/>').val(name).html(name).appendTo($template);
			$.each(data || [], function(i, varbind) {
				if (varbind.address)
					varbind.json_address = JSON.stringify(varbind.address);
				if (varbind.status_conditions)
					varbind.json_status_conditions = JSON.stringify(varbind.status_conditions);
			})
		});		

	});

	function toggleScanButton(start) {
		$start = $page.find('#device-scan-start').toggle(!start);
		$cancel = $page.find('#device-scan-cancel').toggle(start);
	}

	$page.on('keydown', '#page-device-scan #range', function (event) {
		$start = $page.find('#device-scan-start');
		if (event.keyCode == 13 && $start.is(':visible') === !$start.is(':hidden')) // Enter
			return $start.trigger('click');

		$cancel = $page.find('#device-scan-cancel');
		if (event.keyCode == 27 && $cancel.is(':visible') === !$cancel.is(':hidden')) // Esc
			return $cancel.trigger('click');
	});

	$page.on('click', '#page-device-scan #device-scan-cancel', function() {
		$.ajax({
			method: 'GET',
			url: '/scan/cancel',
			success: (res) => toggleScanButton(false)
		})
	});

	$page.on('click', '#page-device-scan #device-scan-start', function() {
		toggleScanButton(true);
		var $table = $page.find('#device-scan-result').hide();
		$.ajax({
			method: 'GET',
			url: '/scan',
			data: {
				range: $page.find('#range').val()
			},
			dataType: 'json',
			error: function(jqXHR, textStatus, errorThrown) {
				toggleScanButton(false);	
				console.log(jqXHR, textStatus, errorThrown);
				alert(jqXHR.responseText);
			},
			success: function (devices) {
				toggleScanButton(false);
				var $result = $table.find('tbody').empty();

				if (!$table.length || !devices.length)
					return;

				$table.show();
				$template_row = $table.find('#template-row');
				
				$.each(devices, function(i, device) {
					$row = $template_row.clone().removeAttr('id');
					$row.find('#name').val(device.name || ('Unknown #' + i));
					$row.find('#ip').val(device.ip);
					$row.find('#mac').val(device.mac);
					$row.find('#description').val(device.description);
					$row.appendTo($result);
				})
			}	
		})
	});

	$page.on('click', '#page-device-scan .add:not([all])', function(event, callback) {
		var $row = $(this).closest('tr');
		var data = {
			name: $row.find('#name').val(),
			ip: $row.find('#ip').val(),
			mac: $row.find('#mac').val(),
			is_ping: $row.find('#is-ping:checked').length,
			period: $row.find('#period').val(),
			tags: $row.find('#tags').val(),
			description: $row.find('#description').val()
		}
		var template = $row.find('#template').val();
		if (template)
			data.json_varbind_list = JSON.stringify(templates[template]);

		$.ajax({
			method: 'POST',
			url: '/device',
			data: data,
			success: function(id) {
				data.id = id;
				setDevice(data);
				$row.find('#td-add').html('&#10004;');
				$device_list.find('li')
					.sort((a, b) => a.innerHTML.toLowerCase() > b.innerHTML.toLowerCase())
					.detach().appendTo($device_list);
				if (callback)
					callback();
			}
		})
	});

	$page.on('click', '#page-device-scan .add[all]', function() {
		var $devices = $(this).closest('table').find('tbody .add');
		if ($devices.length == 0)
			return;

		function addDevice(i) {
			if (i == $devices.length)
				return;

			$devices.eq(i).trigger('click', () => addDevice(i + 1))			
		}
		
		addDevice(0);
	});

	$dashboard.on('click', '#device-tag-list input', function() {
		var $device_tag_list = $dashboard.find('#device-tag-list');
		var $varbind_tag_list = $dashboard.find('#varbind-tag-list');
		var $checked_list = $device_tag_list.find('input:checked:not(#All)');

		$varbind_tag_list.find('input:checked').trigger('click');

		if (this.id == 'All' || $checked_list.length == 0) {
			$device_tag_list.find('input:not(#All)').attr('checked', false).prop('checked', false);
			$device_tag_list.find('#All').attr('checked', true).prop('checked', true);
			$varbind_tag_list.find('div').show();
			return;
		}

		$device_tag_list.find('#All').attr('checked', false).prop('checked', false);		
		$varbind_tag_list.find('div').hide();
		$checked_list.each(function(i, e) {
			var tag_list = $(e).closest('div').data('tag-list') || [];
			$.each(tag_list, function (i, tag) {
				var id = tag.replace('/ /g', '-');
				$varbind_tag_list.find('#' + id).closest('div').show();
			})
		})
	});

	$dashboard.on('click', '#varbind-tag-list input', function() {
		$dashboard.find('#varbind-tag-list input:checked:not(#' + this.id + ')').removeAttr('checked');
		$dashboard.trigger('update-graph', {tag: this.checked && this.id});
	});

	$dashboard.on('update-graph', function(event, data) {
		deleteGraph('dashboard');

		if (!data.tag)
			return;

		$.ajax({
			method: 'GET',
			url: '/tag/' + data.tag,
			data: {
				from: data.period && data.period[0], 
				to: data.period && data.period[1],
				tags: $dashboard.find('#device-tag-list input:checked').map(function () { return this.id}).get().join(';')
			},
			success: function(res) {
				res.rows.forEach((row) => row[0] = new Date(row[0]));

				var opts = {
					animatedZooms: true,
					labels: res.columns,
					valueRange: getRange(res.rows),
					highlightCircleSize: 2,					
					height: $app.height() - $dashboard.find('#tag-list').height() - 40,
					axes: {
						x: {valueFormatter: (ms) => cast('datetime', ms)}
					},
					drawPoints: true,
					plugins : [Dygraph.Plugins.RangeSelector]
				};
			
				graphs.dashboard = new Dygraph($dashboard.find('#graph').get(0), res.rows, opts);
			}
		})
	});

	function deleteGraph(id) {
		if (graphs[id]) {
			graphs[id].destroy();
			delete graphs[id];
		}		
	}

	function updateDashboard () {
		deleteGraph('dashboard');
		
		function addTag($target, tag, data) {
			var id = tag.replace('/ /g', '-');

			$('<div/>')
				.attr('tags', data)
				.data('tag-list', data)
				.append($('<input type = "checkbox" autocomplete = "off"/>').attr('id', id))
				.append($('<label>').attr('for', id).html(tag))
				.appendTo($target);
		}

		$.ajax({
			method: 'GET',
			url: '/tag',
			success: function(tags) {
				var $device_tag_list = $dashboard.find('#device-tag-list').empty();
				$.each(tags, (tag, value) => addTag($device_tag_list, tag, value));				
				$device_tag_list.find('#All').attr('checked', true).closest('div').prependTo($device_tag_list);
	
				var $varbind_tag_list = $dashboard.find('#varbind-tag-list').empty();
				$.each(tags.All, (i, tag) => addTag($varbind_tag_list, tag));
				$varbind_tag_list.find('#latency').closest('div').prependTo($varbind_tag_list);
			}
		});
	}


	var $history_period = $('#history-period').pickmeup({
		hide_on_select: true, 
		mode: 'range',
		show: function () {
			$(this).removeAttr('changed');
		},
		change: function () {
			$(this).attr('changed', true);
		}, 
		hide: function(e) {
			if (!this.hasAttribute('changed'))
				return;

			var period = $(this).data('pickmeup-options').date;
			return (!$page.html()) ? 
				$dashboard.trigger('update-graph', {tag: $dashboard.find('#varbind-tag-list input:checked').attr('id'), period: period}) :
				$page.find('#page-device-view #varbind-list').attr('period', true).trigger('update-graphs', {period: period});
		}
	});

	function createHistoryTableRow (e, value_type) {
		return $('<tr/>')
			.append($('<td>').html(cast('datetime', e.from) + ' - ' + cast('datetime', e.to)))
			.append($('<td>').html(cast(value_type, e.value)))
	}

	function createRangeSelector() {
		return $('<div/>')
			.attr('id', 'history-range-selector')	
			.html('&#8596;')
			.attr('title', 'Select range')
			.click(function (event) {
				var offset = $(this).offset();
				$history_period.css({'top': offset.top, 'left': offset.left}).pickmeup('show');
			});
	}

	Dygraph.Plugins.RangeSelector = (function() {
		function RangeSelector () {
			this.toString = () => 'Range Selector';
			this.activate = (g) => new Object({willDrawChart: this.addRange});
			this.addRange = function (e) {
				var $graph = $(e.dygraph.graphDiv);
				if ($graph.find('#history-range-selector').length)
					return;
	
				createRangeSelector().css('left', e.dygraph.plotter_.area.x + 3).appendTo($graph);
			};
		}
	
		return RangeSelector;
	})();


	$page.on('change', '.varbind-list[protocol="modbus-tcp"] #func', function() {
		var row = $(this).closest('#td-address');
		if (this.value == 'readDiscreteInputs' || this.value == 'readCoils') {
			row.find('#type').val('').attr('value', '');
			row.find('#order').val('').attr('value', '');
		} else {
			row.find('#type').val('readInt16').attr('value', 'readInt16');
			row.find('#order').val('BE').attr('value', 'BE');
		}
	});

	function setDevice(device) {
		var $e = $device_list.find('#' + device.id);
		if ($e.length == 0)	
			$e = $('<li/>')
				.attr('id', device.id)
				.append('<div id = "name"/>')
				.append('<div id = "ip"/>')
				.append('<div id = "mac"/>')
				.appendTo($device_list);
		
		$e.attr('title', device.description).attr('status', device.status || 0);
		$e.find('#name').html(device.name);
		$e.find('#ip').html(device.ip);
		$e.find('#mac').html(device.mac);
		return $e;			
	}

	function getRange(rows) {
		var min, max;
		rows.forEach(function (row) {
			for (var i = 1; i < row.length; i++) {
				min = (min == undefined || !isNaN(row[i]) && min > row[i]) ? row[i] : min;
				max = (max == undefined || !isNaN(row[i]) && max < row[i]) ? row[i] : max;
			}
		})
		return [min , max];
	}

	function highlightProtocolTabs () {
		$page.find('#protocols > label').removeClass('has-varbind');
		$page.find('.varbind-list tbody:has(tr)').each(function() {
			var $e = $(this).closest('table');
			var protocol = $e.attr('protocol');
			$e.closest('#protocols').find('label[for="tab-' + protocol + '"]').addClass('has-varbind');
		})
	}

	function updateTemplates() {
		var error = (msg) => alert('Failed load templates: ' + msg)
		$.ajax({
			method: 'GET',
			url: '/templates.json',
			dataType: 'text',
			error: (jqXHR, textStatus, errorThrown) => error(textStatus),
			success: function (data) {
				try {
					templates = JSON.parse(data || '{}');
				} catch (err) {
					return error(err.message);
				}

				var $list = $app.find('#template-list').empty();
				$.each(templates, function (name, data) {
					$('<div/>')
						.addClass('device-add')
						.attr('name', name)
						.html(name)
						.data('template', data)
						.append($('<span/>').attr('id', 'template-remove').attr('title', 'Remove template').html('&#10006;'))
						.appendTo($list);
				});	
			}
		});		
	}

	var socket;
	function connect() {
		socket = new WebSocket('ws://' + location.hostname + ':' + (parseInt(location.port) + 1));
	
		var timer = setTimeout(function() {
			console.error(new Date() + ': Notify server disconnected. Page must be reload.');
		}, 5000);	
	
		socket.onopen = function() {
			clearTimeout(timer);
			console.log(new Date() + ': Notify server is connected.');
		};
	
		socket.onclose = function(event) {
			console.log(new Date() + ': Notify server is disconnected.');
			setTimeout(connect, 1000);
		};
	
		socket.onerror = function(error) {
			// console.log(error.message);
		};
	
		socket.onmessage = function(event) {
			var packet = JSON.parse(event.data);

			// console.log(packet)
			if (packet.event == 'status-updated')
				$device_list.find('li#' + packet.id).attr('status', packet.status);

			if (packet.event == 'values-changed') {
				var $varbind_list = $page.find('#varbind-list');
				if (!$varbind_list.length || $varbind_list[0].hasAttribute('period'))
					return;

				var time = new Date(packet.time);
				var hour = 1000 * 60 * 60;
				$.each(packet.values, function(i, varbind) {
					var $row = $varbind_list.find('tr#' + varbind.id);
					if ($row.length == 0)
						return;

					$row.find('#td-value').html(cast(varbind.value_type, varbind.value));

					if (varbind.value_type != 'number') {
						var $table = $row.find('#td-history table');
						if ($table.length == 0)
							return;
						
						var last_event = $table.data('last-event') || {from: packet.time, to: packet.time, value: varbind.value};
						var isChange = last_event.value != varbind.value;

						if (!isChange)
							$table.find('tr:last').remove();

						var event = {from: (isChange) ? last_event.from : last_event.to, to: packet.time, value: varbind.value};	
						createHistoryTableRow(event, varbind.value_type).appendTo($table);
						$table.data('last-event', event);
					} else {
						var val = parseFloat(varbind.value);
						var graph = graphs[varbind.id];
						if (graph) {
							var data = graph.file_;
							var range = graph.user_attrs_.valueRange;
	
							if (!isNaN(val)) 
								range = [range[0] > val ? val : range[0], range[1] < val ? val : range[1]];
	
							data = data.filter((e) => e[0].getTime() + hour > packet.time);
							data.push([time, val || varbind.value]);
							graph.updateOptions({file: data, valueRange: range});
						}
					}
				})
			}	
		};
	}
	connect();

	$(document).ajaxSend(function(event, request, settings) {
		try {
			socket.send(settings.url);
		} catch(err) {}
	});

	$.ajaxSetup({
		error: function(jqXHR, textStatus, errorThrown) {
			console.log(jqXHR, textStatus, errorThrown);
			alert(jqXHR.responseText);
		}
	});
	
	$(document).ajaxComplete(function(event, req, settings) {

		$('#app').css('cursor', 'initial');

		if (req.status != 200)
			return;

		if (settings.url == '/device' && settings.method == 'POST')
			return updateDashboard();

		if (settings.url.indexOf('/device/') == 0 && settings.method == 'DELETE')
			return updateDashboard();

		if (/^\/device\/([\d]*)\/varbind-history$/.test(settings.url)) 
			$history_period.pickmeup('set_date', new Date());

		if (settings.url.indexOf('/template/') == 0 && (settings.method == 'POST' || settings.method == 'DELETE'))	
			updateTemplates();
	});
	
	$(document).ajaxStart(function() {
		$('#app').css('cursor', 'wait');
	});

	function cast(type, value, args) {
		type = (type + '').toLowerCase();
	
		if (!type)
			return value;
	
		if (value == null || value == undefined)
			return '';
	
		if(type == 'string')
			return value + '';
	
		if (type == 'number' && !isNaN(value)) {
			var factor = Math.pow(10, 2); // 2 digit after .
			return Math.round(value * factor) / factor;
		}	
	
		if ((type == 'time' || type == 'date' || type == 'datetime') && !isNaN(value) && !!value) {
			var datetime = {
				datetime : "%d.%m.%Y %H:%M",
				date : "%d.%m.%Y",
				time : "%H:%M",		
				pickmeup: "d.m.Y"
			}
			return strftime(datetime[type], new Date(parseInt(value) || value));
		}
	
		if (type == 'filesize' && !isNaN(value)) {
			var i = Math.floor(Math.log(value) / Math.log(1024));
	
			return (value / Math.pow(1024, i)).toFixed(2) * 1 + ['B', 'kB', 'MB', 'GB', 'TB'][i];		
		}
	
		if (type == 'onoff') 
			return ['On', 'Off'][(value) ? 0 : 1];
	
		if (type == 'yesno') 
			return ['Yes', 'No'][(value) ? 0 : 1];
		
		if (type == 'duration' && !isNaN(value)) {
			var min = 6000;
			var mhd = [Math.floor((value/min % 60)), Math.floor((value/(60 * min)) % 24), Math.floor(value/(24 * 60 * min))];
			var txt = ['m','h','d'];
			var res = (mhd[2] ? mhd[2] + txt[2] + ' ' : '') + (mhd[1] ? mhd[1] + txt[1] + ' ' : '') + ((args != 'short' || mhd[0]) ? mhd[0] + txt[0] : '');
			return res.trim();
		}
	
		return value;
	}
});