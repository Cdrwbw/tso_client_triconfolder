var battleEnemiesDrop;
var battleWindow;
var battleSearchFor;
var battlePacket;
var battleTemplates;

function battleMenuHandler(event)
{
	try {
		if(game.gi.isOnHomzone()) {
			game.showAlert(loca.GetText("MEL", "ExplorerDidNotFindEventZone"));
			return;
		}
		battleTemplates = new SaveLoadTemplate('battle', function(data) {
			battlePacket = data;
			try{
				battleLoadData();
			} catch(e) {
				game.chatMessage("Error loading " + e, 'army_move');
			}
		});
		battleWindow = new Modal('battleWindow', utils.getImageTag('SummerEvent2022Bundle1') + ' ' + loca.GetText("ACL", "ExcelsiorLostCityBeforeRitual"));
		battleWindow.create();
		if(battleWindow.Title().find(".btn-army").length == 0) {
			battleWindow.Title().append($('<button>').attr({ "class": "btn btn-army pull-right", 'style': 'position:relative;top:2px;left:-5px;' }).text(loca.GetText("LAB","Army")));
			battleWindow.Title().find(".btn-army").click(armyMenuHandler);
		}
		if(battleWindow.withFooter(".armySaveTemplate").length == 0) {
			battleWindow.Footer().prepend([
				$('<button>').attr({ "class": "btn btn-primary pull-left armySaveTemplate" }).text(getText('save_template')).click(battleSaveDialog),
				$('<button>').attr({ "class": "btn btn-primary pull-left armyLoadTemplate" }).text(getText('load_template')).click(function() { battleTemplates.load(); }),
				$('<button>').attr({ "class": "btn btn-primary directAttack" }).text(loca.GetText("ACL", "PvPAttacker")).click(battleAttackDirect),
				$('<button>').attr({ "class": "btn btn-primary reset" }).text(getText('btn_reset')).click(function(){
					battleGetData();
				}),
				$('<button>').attr({ "class": "btn btn-primary loadAttack" }).text(loca.GetText("ACL", "PvPAttacker")).click(battleAttack),
				$('<button>').attr({ "class": "btn btn-primary loadMove" }).text(loca.GetText("LAB", "Move")).click(battleMove),
			]);
		}
		if($('#battleWindow .modal-content #armyDrop').length == 0) {
			$('#battleWindow .modal-content').append($('<div>', { 'id': 'armyDrop' }));
			battleDropdown(game.zone.mStreetDataMap.GetBuildings_vector().filter(function(e) { return e && e.IsReadyToIntercept(); }));
		}
		battleGetData();
		battleWindow.show();
	} catch (e) { alert(e); }
}

function battleSaveDialog()
{
	if(battleWindow.withBody('[type=checkbox]:checked').length == 0) { return; }
	battleWindow.settings(battleSaveTemplate, '');
	battleWindow.sTitle().html(loca.GetText("LAB", "ChangeSortingOrder"));
	var out = '<div class="container-fluid" style="user-select: all;">';
	var select = $('<select>').attr('class', 'form-control').append($('<option>', { value: 1000 }).text('1s'));
	for(var i = 2; i < 21; i++) {
		select.append($('<option>', { value: i * 1000 }).text(i+'s'));
	}
	var timeSelectRow = $(utils.createTableRow([[2, select.prop('outerHTML')]])).find("div:first");
	battleWindow.withBody('[type=checkbox]:checked').each(function(i, item) {
		var row = $(item).closest("div.row").clone();
		row.find("div").slice(-1).remove();
		row.find("[type=checkbox], #specOpen").hide();
		row.find("div:first").html(function(index,html){ return '&#8597;&nbsp;' + html.replace(/\&nbsp;/g,''); }).attr('class', function(i, c){
			return c.replace(/4/g, '5');
		});
		row.find("div:last").attr('class', function(i, c){ return c.replace(/4/g, '5'); });
		row.append(timeSelectRow);
		out += row.prop('outerHTML');
	});
	battleWindow.sBody().html(out + '<div>');
	battleWindow.sBody().find(".container-fluid").sortable();
	$('#' + battleWindow.rawsId).modal({backdrop: "static"});
}

function battleSaveTemplate()
{
	var sortOrder = {}, savePacket = {}, sortedPacket = {};
	battleWindow.sBody().find('[type=checkbox]').each(function(i, item) { sortOrder[item.id] = { 'order': i, 'time': parseInt($(item).closest("div.row").find("select").val()) }; });
	battleWindow.withBody('[type=checkbox]:checked').each(function(i, item) {
		var spec = armyGetSpecialistFromID(item.id);
		savePacket[item.id] = { 'grid': spec.GetGarrisonGridIdx(), 'name': spec.getName(false), 'order': sortOrder[item.id].order, 'time': sortOrder[item.id].time };
		var grid = $(item).closest("div.row").find("button").val();
		if(!grid || grid == 0 || grid == "0") { return; }
		savePacket[item.id].target = parseInt(grid);
		savePacket[item.id].targetName = loca.GetText("BUI", game.zone.mStreetDataMap.GetBuildingByGridPos(parseInt(grid)).GetBuildingName_string());
	});
	Object.keys(savePacket).sort(function(a, b){ return savePacket[a].order - savePacket[b].order; }).forEach(function(key) { sortedPacket[key] = savePacket[key]; });
	$('#' + battleWindow.rawsId).modal('hide');
	if(Object.keys(savePacket).length > 0) { battleTemplates.save(sortedPacket); }
}

function battleSendGeneral(spec, name, targetName, type, target)
{
	try
	{
		game.gi.mCurrentCursor.mCurrentSpecialist = spec;
		var stask = new armySpecTaskDef();
		stask.uniqueID = spec.GetUniqueID();
		stask.subTaskID = 0;
		swmmo.application.mGameInterface.SendServerAction(95, type, target, 0, stask);
		game.chatMessage(name.replace(/<|b|>|\//g, "") + (type == 5 ? ' x ' : ' > ') + targetName, 'battle');
	}
	catch (error) { }
}

function battleLoadData()
{
	battleWindow.withFooter(".directAttack").hide();
	battleWindow.withFooter(".reset").show();
	var out = '<div class="container-fluid" style="user-select: all;">';
	out += utils.createTableRow([[4, loca.GetText("LAB", "Name")], [4, getText('armyCurrentArmy')], [1, loca.GetText("LAB", "Objective")], [2, loca.GetText("LAB", "Attack")], [1, '#']], true);
	var canSubmitAttack = false, canSubmitMove = false;
	$.each(battlePacket, function(item) { 
		var spec = armyGetSpecialistFromID(item);
		if(spec == null) {
			out += utils.createTableRow([
				[4, '<button type="button" class="close pull-left" value="'+item+'"><span>&times;</span></button>&nbsp;' + battlePacket[item].name], 
				[8, 'spec is null', "buffNotReady"]]);
			canSubmitAttack = false, canSubmitMove = false;
			return;
		}
		battlePacket[item].onSameGrid = spec.GetGarrisonGridIdx() == battlePacket[item].grid;
		battlePacket[item].canMove = spec.GetTask() == null && game.zone.mStreetDataMap.GetBlocked(battlePacket[item].grid) == 0 && !game.zone.mStreetDataMap.IsBlockedAllowedNothingOrFog(battlePacket[item].grid);
		battlePacket[item].canAttack = spec.GetTask() == null && battlePacket[item].target > 0 && spec.GetTask() == null && spec.HasUnits() && game.zone.mStreetDataMap.GetBuildingByGridPos(battlePacket[item].target) != null;
		var info = '';
		spec.GetArmy().GetSquadsCollection_vector().sort(game.def("MilitarySystem::cSquad").SortByCombatPriority).forEach(function(squad){
			info += utils.getImageTag(squad.GetType()) + ' ' + squad.GetAmount() + '&nbsp;';
		});
		var targetBuilding = battlePacket[item].target > 0 ? game.zone.mStreetDataMap.GetBuildingByGridPos(battlePacket[item].target) : null;
		out += utils.createTableRow([
			[4, '<button type="button" class="close pull-left" value="'+item+'"><span>&times;</span></button>&nbsp;' + getImageTag(spec.getIconID(), '24px', '24px') + ' ' + spec.getName(false)], 
			[4, info],
			[1, battlePacket[item].grid, battlePacket[item].canMove || battlePacket[item].onSameGrid ? "buffReady" : "buffNotReady"],
			[2, targetBuilding != null ? loca.GetText("BUI", targetBuilding.GetBuildingName_string()) : battlePacket[item].targetName,
					!battlePacket[item].target || (battlePacket[item].target && battlePacket[item].canAttack) ? !battlePacket[item].target ? '' : "buffReady" : "buffNotReady"],
			[1, (battlePacket[item].time / 1000) + 's']]);
		if(battlePacket[item].canMove && !battlePacket[item].onSameGrid) { canSubmitMove = true; }
		if(battlePacket[item].canAttack && battlePacket[item].target > 0) { canSubmitAttack = true; }
	});
	battleWindow.Body().html(out + '<div>');
	if(canSubmitAttack) { battleWindow.withFooter(".loadAttack").show(); }
	if(canSubmitMove) { battleWindow.withFooter(".loadMove").show(); }
	battleWindow.withBody(".close").click(function(e) { 
		delete battlePacket[$(e.currentTarget).val()];
		$(e.currentTarget).closest('.row').remove();
		battleLoadData();
	});
}

function battleAttack()
{
	var queue = new TimedQueue(1000);
	$.each(battlePacket, function(item) {
		if(!battlePacket[item].canAttack) { return; }
		var spec = armyGetSpecialistFromID(item);
		queue.add(function(){ battleSendGeneral(spec, battlePacket[item].name, battlePacket[item].targetName, 5, battlePacket[item].target); }, battlePacket[item].time);
	});
	if(queue.len() > 0) {
		queue.run();
		battleWindow.hide();
		showGameAlert(getText('command_sent'));
	}
}

function battleMove()
{
	var queue = new TimedQueue(1000);
	$.each(battlePacket, function(item) {
		if(!battlePacket[item].canMove) { return; }
		var spec = armyGetSpecialistFromID(item);
		queue.add(function(){ battleSendGeneral(spec, battlePacket[item].name, battlePacket[item].grid, 4, battlePacket[item].grid); });
	});
	if(queue.len() > 0) {
		queue.run();
		battleWindow.hide();
		showGameAlert(getText('command_sent'));
	}
}

function battleAttackDirect()
{
	var queue = new TimedQueue(1000);
	battleWindow.withBody('[type=checkbox]').each(function(i, item) {
		var spec = armyGetSpecialistFromID(item.id);
		var grid = $(item).closest("div.row").find("button").val();
		if(!grid || grid == 0 || grid == "0") { return; }
		queue.add(function(){ battleSendGeneral(spec, 5, grid); });
	});
	if(queue.len() > 0) {
		queue.run();
		battleWindow.hide();
		showGameAlert(getText('command_sent'));
	}
}

function battleDropdown(data)
{
	var groupSend = $('<div>', { 'class': 'dropdown' }).append([
			$('<button>').attr({ 
				"class": "btn btn-success dropdown-toggle",
				"style": 'height: 28px;display:none;',
				'aria-haspopup': 'true',
				'aria-expanded': 'false',
				'data-toggle': "dropdown"
			}).text(loca.GetText("LAB", "Select"))
	]);
	var groupSendItems = $('<div>', {
		'x-placement': 'bottom-start',
		'style': 'background: transparent; position: absolute; top: -100px; width:900px; height: 200px; overflow-y: scroll;',
		'class': 'dropdown-menu modal-content'
	}).append($('<li>', { 'style': 'float: left;' }).html($('<button>', { 'class': 'btn', 'style': 'clear: both;color:black;height:39px;', 'id': 0, 'value': loca.GetText("LAB", "Select") }).html(getText("btn_reset"))));
	data.forEach(function(item){
		try {
			var info = '';
			item.GetArmy().GetSquadsCollection_vector().sort(game.def("MilitarySystem::cSquad").SortByCombatPriority).forEach(function(squad){
				info += utils.getImageTag(squad.GetType()) + ' ' + squad.GetAmount() + '&nbsp;';
			});
			groupSendItems.append($('<li>', { 'style': 'float: left;' }).html($('<button>', { 'class': 'btn', 'style': 'clear: both;color:black;', 'id': item.GetGrid(), 'value': loca.GetText("BUI", item.GetBuildingName_string()) }).html(info)));
		} catch (e) {}
	});
	groupSend.append(groupSendItems);
	$("#battleWindow .modal-content #armyDrop").html(groupSend.prop("outerHTML"));
}

function battleGetData()
{
	battleSearchFor = null;
	battleWindow.withFooter(".directAttack").show();
	battleWindow.withFooter(".loadAttack, .loadMove, .reset").hide();
	var html = '<div class="container-fluid" style="user-select: all;">';
	html += utils.createTableRow([[4, loca.GetText("LAB", "Name")], [4, getText('armyCurrentArmy')], [4, loca.GetText("LAB", "Attack")]], true);
	game.zone.GetSpecialists_vector().sort(armyGeneralSorter).forEach(function(item){
		try {
			if(!armySPECIALIST_TYPE.IsGeneral(item.GetType()) || item.getPlayerID() != game.player.GetPlayerId()) { return; }
			if(item == null || typeof item == 'undefined' || item.GetTask() != null) { return; }
			var info = '';
			var uniqId = item.GetUniqueID().toKeyString();
			item.GetArmy().GetSquadsCollection_vector().sort(game.def("MilitarySystem::cSquad").SortByCombatPriority).forEach(function(squad){
				info += utils.getImageTag(squad.GetType()) + ' ' + squad.GetAmount() + '&nbsp;';
			});
			if (item.GetGarrisonGridIdx() > 0) {
				html += utils.createTableRow([
					[4, '<input type="checkbox" id="' + uniqId + '" />&nbsp;' + $(getImageTag(item.getIconID(), '24px', '24px')).css("cursor", "pointer").attr({ "id": "specOpen", 'name': item.GetGarrisonGridIdx() }).prop('outerHTML') + ' ' + item.getName(false)], 
					[4, info],
					[4, (item.HasUnits() ? $("<button>", { "class": "btn btn-sm btn-success", "style": 'height: 28px;', 'id': uniqId }).text(loca.GetText("LAB", "Select")).prop("outerHTML") + '&nbsp;&nbsp;'    + $(getImageTag("accuracy.png", '24px', '24px')).css("cursor", "pointer").attr({ "id": "specOpen" }).prop("outerHTML") : ''), 'armySelect']]);
			} else {
				html += utils.createTableRow([
					[4, '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;' + getImageTag(item.getIconID(), '24px', '24px') + ' ' + item.getName(false)], 
					[8, getImageTag("Star", '24px', '24px')]]);
			}
		} catch(e) {}
	});
	battleWindow.Body().html(html + '<div>');
	if(battlePacket && Object.keys(battlePacket).length > 0) {
		$.each(battlePacket, function(item) {
			if(battlePacket[item].target && game.zone.mStreetDataMap.GetBuildingByGridPos(battlePacket[item].target) != null) {
				battleWindow.withBody('button[id="'+item+'"]').text(battlePacket[item].targetName).val(battlePacket[item].target);
			}
		});
		battlePacket = {};
	}
	battleWindow.withBody("button").click(function(e){
		battleSearchFor = this.id;
		e.stopPropagation();
		$("#battleWindow .dropdown-toggle").dropdown('toggle');
	});
	battleWindow.withBody(".armySelect").css("overflow", "visible");
	battleWindow.withBody(".armySelect > div").css("overflow", "visible");
	battleWindow.Dialog().find(".dropdown-menu button").click(function() {
		battleWindow.withBody('button[id="'+battleSearchFor+'"]').text($(this).val()).val(this.id);
	});
	battleWindow.Dialog().find(".dropdown-menu button").hover(function() {
		var grid = this.id;
		if(!grid || grid == 0 || grid == "0") { return; }
		game.zone.ScrollToGrid(this.id);
		game.gi.SelectBuilding(game.zone.mStreetDataMap.GetBuildingByGridPos(this.id));
	});
	battleWindow.Dialog().find('.dropdown').on('show.bs.dropdown', function () {
		$("#battleWindow .modal-header, .modal-body, .modal-footer").css("opacity", 0);
	});
	battleWindow.Dialog().find('.dropdown').on('hide.bs.dropdown', function () {
		$("#battleWindow .modal-header, .modal-body, .modal-footer").css("opacity", 1);
	});
	battleWindow.withBody("#specOpen").click(function() { 
		var grid = this.name || $(this).closest("div").find("button").val();
		if(!grid || grid == 0 || grid == "0") { return; }
		game.zone.ScrollToGrid(grid);
		if(!this.name) { game.gi.SelectBuilding(game.zone.mStreetDataMap.GetBuildingByGridPos(grid)); }
		$("#battleWindow").css("opacity", 0.2);
		setTimeout(function() { $("#battleWindow").css("opacity", 1); }, 2000);
	});
}
