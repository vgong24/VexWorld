extends Node2D

const Vessel = preload("res://scripts/vessel.gd")
const WorldEntity = preload("res://scripts/world_entity.gd")

var package: Dictionary = {}
var human: CharacterBody2D
var companion: CharacterBody2D
var status_layer: CanvasLayer
var status_panel: PanelContainer
var status_label: Label
var smoke_mode := false
var smoke_frames := 0

func _ready() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS
    package = _load_json("res://generated/first-grove.world-package.json")
    if package.is_empty():
        push_error("Missing generated First Grove World Package. Run npm --prefix adapters/godot run build.")
        get_tree().quit(2)
        return
    _register_semantic_input()
    _build_world()
    _build_status()
    smoke_mode = OS.get_cmdline_user_args().has("--ci-smoke")

func _process(_delta: float) -> void:
    if Input.is_action_just_pressed("vw_status"):
        status_panel.visible = not status_panel.visible
    if Input.is_action_just_pressed("vw_pause"):
        get_tree().paused = not get_tree().paused
        status_panel.visible = true
        status_label.text = _status_text() + "\n\nLocal adapter paused: %s" % str(get_tree().paused)
    if smoke_mode:
        smoke_frames += 1
        if smoke_frames == 20:
            _capture_smoke()

func _load_json(file_path: String) -> Dictionary:
    if not FileAccess.file_exists(file_path):
        return {}
    var file := FileAccess.open(file_path, FileAccess.READ)
    var parsed = JSON.parse_string(file.get_as_text())
    return parsed if parsed is Dictionary else {}

func _register_semantic_input() -> void:
    var binding_source := _load_json("res://config/action-bindings.json")
    for binding in binding_source.get("bindings", []):
        var engine_action := str(binding.get("engineAction", ""))
        if engine_action.is_empty():
            continue
        if not InputMap.has_action(engine_action):
            InputMap.add_action(engine_action)
        for key_name in binding.get("keys", []):
            var event := InputEventKey.new()
            event.physical_keycode = _physical_keycode(str(key_name))
            if event.physical_keycode != KEY_NONE:
                InputMap.action_add_event(engine_action, event)

func _physical_keycode(name: String) -> Key:
    var key_map := {
        "KeyA": KEY_A,
        "KeyD": KEY_D,
        "KeyI": KEY_I,
        "KeyJ": KEY_J,
        "KeyK": KEY_K,
        "KeyF": KEY_F,
        "KeyP": KEY_P,
        "ArrowLeft": KEY_LEFT,
        "ArrowRight": KEY_RIGHT,
        "Space": KEY_SPACE,
        "Tab": KEY_TAB,
        "Escape": KEY_ESCAPE
    }
    return key_map.get(name, KEY_NONE)

func _build_world() -> void:
    var map_data: Dictionary = package.get("map", {})
    var laws: Dictionary = package.get("laws", {})
    var expression: Dictionary = package.get("expressions", {})
    var envs: Dictionary = expression.get("environments", {})
    var palette: Dictionary = envs.get("GARDEN_MEADOW", {})
    RenderingServer.set_default_clear_color(Color.from_string(str(palette.get("sky", ["#82cfff"])[0]), Color("#82cfff")))

    for platform in map_data.get("platforms", []):
        _add_platform(platform, Color.from_string(str(palette.get("ground", "#5b8d4d")), Color("#5b8d4d")))

    for decoration in map_data.get("decorations", []):
        var kind := "TREE" if str(decoration.get("archetypeRef", "")).ends_with("tree") else "ROCK"
        _add_world_entity(decoration, kind, palette)

    for point in map_data.get("restorationPoints", []):
        _add_world_entity(point, "REST_POINT", palette)

    for portal in map_data.get("portals", []):
        _add_world_entity(portal, "PORTAL", palette)

    for enemy in map_data.get("enemies", []):
        _add_world_entity(enemy, "CREATURE", palette)

    var spawn: Dictionary = map_data.get("spawn", {})
    human = Vessel.new()
    human.position = _point(spawn.get("human", {"x": 420, "y": 470}))
    human.configure({
        "semanticRef": "vessel.first-grove.human.reference",
        "participantRef": "participant.reference.human",
        "vesselKind": "HUMAN",
        "laws": laws,
        "color": str(palette.get("accent", "#ffd95a"))
    })
    add_child(human)

    companion = Vessel.new()
    var companion_spawns: Array = spawn.get("companions", [])
    companion.position = _point(companion_spawns[0] if not companion_spawns.is_empty() else {"x": 350, "y": 470})
    companion.configure({
        "semanticRef": "vessel.first-grove.companion.reference",
        "participantRef": "participant.reference.companion",
        "vesselKind": "COMPANION",
        "laws": laws,
        "followTarget": human,
        "color": "#7de2ff"
    })
    add_child(companion)

    var camera := Camera2D.new()
    camera.position = Vector2(180, -80)
    camera.position_smoothing_enabled = true
    camera.position_smoothing_speed = 5.5
    human.add_child(camera)

func _add_platform(data: Dictionary, color: Color) -> void:
    var width := float(data.get("width", 100))
    var height := float(data.get("height", 20))
    var x := float(data.get("x", 0))
    var y := float(data.get("y", 0))
    var body := StaticBody2D.new()
    body.name = str(data.get("id", "platform"))
    body.position = Vector2(x + width / 2.0, y + height / 2.0)
    body.set_meta("vexworld_ref", str(data.get("id", "")))
    var collision := CollisionShape2D.new()
    var shape := RectangleShape2D.new()
    shape.size = Vector2(width, height)
    collision.shape = shape
    body.add_child(collision)
    var polygon := Polygon2D.new()
    polygon.polygon = PackedVector2Array([
        Vector2(-width / 2.0, -height / 2.0),
        Vector2(width / 2.0, -height / 2.0),
        Vector2(width / 2.0, height / 2.0),
        Vector2(-width / 2.0, height / 2.0)
    ])
    polygon.color = color
    body.add_child(polygon)
    add_child(body)

func _add_world_entity(data: Dictionary, kind: String, palette: Dictionary) -> void:
    var entity := WorldEntity.new()
    entity.position = _point(data)
    var color := str(palette.get("far", "#7abf9a"))
    if kind == "ROCK": color = "#83919a"
    if kind == "REST_POINT": color = str(palette.get("accent", "#ffd95a"))
    if kind == "PORTAL": color = "#b68cff"
    if kind == "CREATURE": color = "#8ed081"
    entity.configure({
        "semanticRef": str(data.get("entityRef", data.get("id", ""))),
        "kind": kind,
        "color": color,
        "scale": float(data.get("scale", 1.0)),
        "title": str(data.get("title", ""))
    })
    entity.scale = Vector2.ONE * float(data.get("scale", 1.0))
    add_child(entity)

func _point(data) -> Vector2:
    if data is Dictionary:
        return Vector2(float(data.get("x", 0)), float(data.get("y", 0)))
    return Vector2.ZERO

func _build_status() -> void:
    status_layer = CanvasLayer.new()
    add_child(status_layer)
    status_panel = PanelContainer.new()
    status_panel.position = Vector2(28, 28)
    status_panel.custom_minimum_size = Vector2(520, 0)
    status_layer.add_child(status_panel)
    var margin := MarginContainer.new()
    margin.add_theme_constant_override("margin_left", 18)
    margin.add_theme_constant_override("margin_right", 18)
    margin.add_theme_constant_override("margin_top", 14)
    margin.add_theme_constant_override("margin_bottom", 14)
    status_panel.add_child(margin)
    status_label = Label.new()
    status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    status_label.text = _status_text()
    margin.add_child(status_label)
    status_panel.visible = false

func _status_text() -> String:
    var manifest: Dictionary = package.get("manifest", {})
    return "VEXTORY / GODOT ADAPTER PROOF\n\nWorld: %s\nWorld ref: %s\nReality: %s\nPackage: %s\nFingerprint: %s\nHuman vessel ref: %s\nCompanion vessel ref: %s\n\nGodot scene/node paths are replaceable adapter state.\nCanonical meaning remains in the VexWorld World Package.\n\n[I or Tab] close status" % [
        str(manifest.get("title", "First Grove")),
        str(manifest.get("worldRef", "UNKNOWN")),
        str(manifest.get("realityClass", "UNKNOWN")),
        str(package.get("packageRef", "UNKNOWN")),
        str(package.get("integrityFingerprint", "UNKNOWN")),
        str(human.get_meta("vexworld_ref", "UNKNOWN")) if human else "UNKNOWN",
        str(companion.get_meta("vexworld_ref", "UNKNOWN")) if companion else "UNKNOWN"
    ]

func _capture_smoke() -> void:
    DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://artifacts"))
    var image := get_viewport().get_texture().get_image()
    var screenshot_path := "res://artifacts/first-grove-smoke.png"
    var result := image.save_png(screenshot_path)
    var receipt := {
        "schemaVersion": "vexworld.godot-visual-smoke/v1",
        "adapterRef": "adapter.vexworld.godot.first-grove.v0",
        "packageRef": package.get("packageRef", "UNKNOWN"),
        "integrityFingerprint": package.get("integrityFingerprint", "UNKNOWN"),
        "screenshotPath": screenshot_path,
        "screenshotWriteError": result,
        "humanSemanticRef": human.get_meta("vexworld_ref", "UNKNOWN") if human else "UNKNOWN",
        "companionSemanticRef": companion.get_meta("vexworld_ref", "UNKNOWN") if companion else "UNKNOWN",
        "semanticOwner": "VEXWORLD_WORLD_PACKAGE",
        "engineRole": "REPLACEABLE_REALIZATION_ADAPTER"
    }
    var file := FileAccess.open("res://artifacts/visual-smoke-receipt.json", FileAccess.WRITE)
    file.store_string(JSON.stringify(receipt, "  "))
    file.close()
    print("VEXWORLD_GODOT_SMOKE=" + JSON.stringify(receipt))
    get_tree().quit(0 if result == OK else 3)
