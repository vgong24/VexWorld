extends CharacterBody2D

var semantic_ref: String = ""
var participant_ref: String = ""
var vessel_kind: String = "HUMAN"
var laws: Dictionary = {}
var follow_target: CharacterBody2D = null
var expression_color: Color = Color("#f7d46a")
var expression_profile: Dictionary = {}
var expression_binding_ref: String = ""
var topology_ref: String = ""
var facing: float = 1.0
var dash_remaining: float = 0.0
var attack_flash: float = 0.0

func configure(config: Dictionary) -> void:
    semantic_ref = str(config.get("semanticRef", ""))
    participant_ref = str(config.get("participantRef", ""))
    vessel_kind = str(config.get("vesselKind", "HUMAN"))
    laws = config.get("laws", {})
    follow_target = config.get("followTarget", null) as CharacterBody2D
    expression_color = Color.from_string(str(config.get("color", "#f7d46a")), Color.WHITE)
    expression_profile = config.get("expressionBinding", {})
    expression_binding_ref = str(expression_profile.get("expressionBindingRef", ""))
    topology_ref = str(expression_profile.get("topologyRef", ""))

    if expression_binding_ref.is_empty():
        push_error("VexWorld vessel requires a semantic character expression binding")
    if str(expression_profile.get("vesselRef", "")) != semantic_ref:
        push_error("Character expression vesselRef does not match semantic vessel ref")

    set_meta("vexworld_ref", semantic_ref)
    set_meta("participant_ref", participant_ref)
    set_meta("adapter_role", vessel_kind)
    set_meta("expression_binding_ref", expression_binding_ref)
    set_meta("body_topology_ref", topology_ref)
    set_meta("expression_semantic_owner", "VEXWORLD_CHARACTER_VESSEL_ADAPTER")
    _install_collision()
    queue_redraw()

func _install_collision() -> void:
    var collision: CollisionShape2D = CollisionShape2D.new()
    var shape: CapsuleShape2D = CapsuleShape2D.new()
    shape.radius = 14.0
    shape.height = 46.0
    collision.shape = shape
    collision.position = Vector2(0, -23)
    add_child(collision)

func _physics_process(delta: float) -> void:
    var gravity: float = float(laws.get("gravity", 1900.0))
    var movement: Dictionary = laws.get("movement", {})
    var speed: float = float(movement.get("humanSpeed", 250.0))
    if vessel_kind == "COMPANION":
        speed = float(movement.get("companionSpeed", 225.0))

    if not is_on_floor():
        velocity.y = minf(velocity.y + gravity * delta, float(laws.get("maxFallSpeed", 1100.0)))

    if vessel_kind == "HUMAN":
        var axis: float = Input.get_axis("vw_move_left", "vw_move_right")
        if dash_remaining > 0.0:
            velocity.x = facing * speed * 2.35
            dash_remaining -= delta
        else:
            velocity.x = move_toward(velocity.x, axis * speed, speed * 8.0 * delta)
            if absf(axis) > 0.01:
                facing = signf(axis)
        if Input.is_action_just_pressed("vw_jump") and is_on_floor():
            velocity.y = float(movement.get("jumpVelocity", -720.0))
        if Input.is_action_just_pressed("vw_arc_dash"):
            dash_remaining = 0.18
        if Input.is_action_just_pressed("vw_attack_basic"):
            attack_flash = 0.16
    elif follow_target != null:
        var desired_x: float = follow_target.global_position.x - 72.0
        var gap: float = desired_x - global_position.x
        var follow_axis: float = clampf(gap / 90.0, -1.0, 1.0)
        velocity.x = move_toward(velocity.x, follow_axis * speed, speed * 6.0 * delta)
        if absf(follow_axis) > 0.05:
            facing = signf(follow_axis)
        if is_on_floor() and follow_target.global_position.y < global_position.y - 55.0 and absf(gap) < 230.0:
            velocity.y = float(movement.get("jumpVelocity", -720.0)) * 0.92

    attack_flash = maxf(0.0, attack_flash - delta)
    move_and_slide()
    queue_redraw()

func _draw() -> void:
    var glow: Color = expression_color.lightened(0.24 if attack_flash > 0.0 else 0.0)
    var source_class: String = str(expression_profile.get("sourceClass", "UNKNOWN"))
    if source_class != "VEXWORLD_ORIGINAL_PROCEDURAL":
        draw_rect(Rect2(-14, -44, 28, 44), Color("#ff4fd8"), false, 2.0)

    if vessel_kind == "COMPANION":
        draw_circle(Vector2(0, -27), 18.0, Color(glow.r, glow.g, glow.b, 0.24))
        draw_circle(Vector2(0, -27), 11.0, glow)
        draw_circle(Vector2(-4, -30), 2.0, Color("#213847"))
        draw_circle(Vector2(4, -30), 2.0, Color("#213847"))
        draw_line(Vector2(-16, -19), Vector2(-28, -11), expression_color, 4.0)
        draw_line(Vector2(16, -19), Vector2(28, -11), expression_color, 4.0)
    else:
        draw_circle(Vector2(0, -38), 13.0, Color("#ffd6b5"))
        draw_rect(Rect2(-13, -27, 26, 31), glow, true)
        draw_line(Vector2(-8, 4), Vector2(-10, 19), Color("#394867"), 7.0)
        draw_line(Vector2(8, 4), Vector2(10, 19), Color("#394867"), 7.0)
        draw_line(Vector2(facing * 12, -15), Vector2(facing * 30, -6), Color("#7de2ff"), 4.0)
