extends CharacterBody2D

var semantic_ref: String = ""
var participant_ref: String = ""
var vessel_kind: String = "HUMAN"
var laws: Dictionary = {}
var follow_target: CharacterBody2D = null
var expression_color: Color = Color("#f7d46a")
var facing := 1.0
var dash_remaining := 0.0
var attack_flash := 0.0

func configure(config: Dictionary) -> void:
    semantic_ref = str(config.get("semanticRef", ""))
    participant_ref = str(config.get("participantRef", ""))
    vessel_kind = str(config.get("vesselKind", "HUMAN"))
    laws = config.get("laws", {})
    follow_target = config.get("followTarget", null)
    expression_color = Color.from_string(str(config.get("color", "#f7d46a")), Color.WHITE)
    set_meta("vexworld_ref", semantic_ref)
    set_meta("participant_ref", participant_ref)
    set_meta("adapter_role", vessel_kind)
    _install_collision()
    queue_redraw()

func _install_collision() -> void:
    var collision := CollisionShape2D.new()
    var shape := CapsuleShape2D.new()
    shape.radius = 14.0
    shape.height = 46.0
    collision.shape = shape
    collision.position = Vector2(0, -23)
    add_child(collision)

func _physics_process(delta: float) -> void:
    var gravity := float(laws.get("gravity", 1900.0))
    var movement: Dictionary = laws.get("movement", {})
    var speed := float(movement.get("humanSpeed", 250.0))
    if vessel_kind == "COMPANION":
        speed = float(movement.get("companionSpeed", 225.0))

    if not is_on_floor():
        velocity.y = min(velocity.y + gravity * delta, float(laws.get("maxFallSpeed", 1100.0)))

    if vessel_kind == "HUMAN":
        var axis := Input.get_axis("vw_move_left", "vw_move_right")
        if dash_remaining > 0.0:
            velocity.x = facing * speed * 2.35
            dash_remaining -= delta
        else:
            velocity.x = move_toward(velocity.x, axis * speed, speed * 8.0 * delta)
            if abs(axis) > 0.01:
                facing = sign(axis)
        if Input.is_action_just_pressed("vw_jump") and is_on_floor():
            velocity.y = float(movement.get("jumpVelocity", -720.0))
        if Input.is_action_just_pressed("vw_arc_dash"):
            dash_remaining = 0.18
        if Input.is_action_just_pressed("vw_attack_basic"):
            attack_flash = 0.16
    elif follow_target != null:
        var desired_x := follow_target.global_position.x - 72.0
        var gap := desired_x - global_position.x
        var axis := clamp(gap / 90.0, -1.0, 1.0)
        velocity.x = move_toward(velocity.x, axis * speed, speed * 6.0 * delta)
        if abs(axis) > 0.05:
            facing = sign(axis)
        if is_on_floor() and follow_target.global_position.y < global_position.y - 55.0 and abs(gap) < 230.0:
            velocity.y = float(movement.get("jumpVelocity", -720.0)) * 0.92

    attack_flash = max(0.0, attack_flash - delta)
    move_and_slide()
    queue_redraw()

func _draw() -> void:
    var glow := expression_color.lightened(0.24 if attack_flash > 0.0 else 0.0)
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
