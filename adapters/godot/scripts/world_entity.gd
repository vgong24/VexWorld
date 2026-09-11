extends Node2D

var semantic_ref: String = ""
var entity_kind: String = "UNKNOWN"
var expression_color: Color = Color("#7abf9a")
var scale_factor: float = 1.0
var title: String = ""

func configure(config: Dictionary) -> void:
    semantic_ref = str(config.get("semanticRef", ""))
    entity_kind = str(config.get("kind", "UNKNOWN"))
    expression_color = Color.from_string(str(config.get("color", "#7abf9a")), Color.WHITE)
    scale_factor = float(config.get("scale", 1.0))
    title = str(config.get("title", ""))
    set_meta("vexworld_ref", semantic_ref)
    set_meta("expression_kind", entity_kind)
    queue_redraw()

func _draw() -> void:
    match entity_kind:
        "TREE":
            draw_rect(Rect2(-8, -72, 16, 72), Color("#76533b"), true)
            draw_circle(Vector2(-18, -76), 28.0, expression_color)
            draw_circle(Vector2(14, -86), 31.0, expression_color.lightened(0.08))
            draw_circle(Vector2(30, -69), 23.0, expression_color.darkened(0.05))
        "ROCK":
            var points: PackedVector2Array = PackedVector2Array([Vector2(-28, 0), Vector2(-18, -24), Vector2(7, -34), Vector2(31, -11), Vector2(24, 0)])
            draw_colored_polygon(points, expression_color)
            var outline: PackedVector2Array = points.duplicate()
            outline.append(points[0])
            draw_polyline(outline, expression_color.lightened(0.2), 2.0)
        "REST_POINT":
            draw_circle(Vector2.ZERO, 42.0, Color(expression_color.r, expression_color.g, expression_color.b, 0.14))
            for i in range(8):
                var angle: float = TAU * float(i) / 8.0
                draw_circle(Vector2(cos(angle), sin(angle)) * 22.0, 8.0, expression_color)
            draw_circle(Vector2.ZERO, 13.0, Color("#fff4af"))
        "PORTAL":
            draw_arc(Vector2.ZERO, 44.0, 0.0, TAU, 64, expression_color, 7.0)
            draw_arc(Vector2.ZERO, 28.0, 0.0, TAU, 48, expression_color.lightened(0.25), 3.0)
            draw_line(Vector2(-20, 0), Vector2(20, 0), Color(expression_color.r, expression_color.g, expression_color.b, 0.55), 2.0)
        "CREATURE":
            _draw_oval(Vector2.ZERO, Vector2(25, 16), expression_color)
            draw_circle(Vector2(-7, -4), 3.0, Color("#203846"))
            draw_circle(Vector2(7, -4), 3.0, Color("#203846"))
            draw_line(Vector2(0, -15), Vector2(7, -29), Color("#5b8d4d"), 4.0)
            draw_circle(Vector2(10, -31), 6.0, Color("#8ed081"))
        "RESIDENT":
            draw_circle(Vector2(0, -46), 13.0, Color("#f1d4b2"))
            draw_rect(Rect2(-17, -33, 34, 39), Color("#577b58"), true)
            var apron: PackedVector2Array = PackedVector2Array([Vector2(-13, -20), Vector2(13, -20), Vector2(10, 4), Vector2(-10, 4)])
            draw_colored_polygon(apron, expression_color)
            draw_line(Vector2(-8, 6), Vector2(-9, 27), Color("#35563d"), 4.0)
            draw_line(Vector2(8, 6), Vector2(9, 27), Color("#35563d"), 4.0)
            draw_arc(Vector2.ZERO, 33.0, 0.15 * PI, 0.85 * PI, 24, Color(expression_color.r, expression_color.g, expression_color.b, 0.45), 2.0)
        "DISCOVERY":
            draw_circle(Vector2.ZERO, 28.0, Color(expression_color.r, expression_color.g, expression_color.b, 0.12))
            draw_arc(Vector2.ZERO, 20.0, 0.0, TAU, 32, expression_color, 3.0)
            var star: PackedVector2Array = PackedVector2Array()
            for i in range(8):
                var angle: float = TAU * float(i) / 8.0
                var radius: float = 15.0 if i % 2 == 0 else 7.0
                star.append(Vector2(cos(angle), sin(angle)) * radius)
            draw_colored_polygon(star, Color("#fff7ba"))
        "WITNESS_SITE":
            for radius in [18.0, 31.0, 44.0]:
                draw_arc(Vector2.ZERO, radius, 0.0, TAU, 48, Color(expression_color.r, expression_color.g, expression_color.b, 0.72), 2.0)
            var diamond: PackedVector2Array = PackedVector2Array([Vector2(0, -20), Vector2(14, 4), Vector2(0, 20), Vector2(-14, 4)])
            draw_colored_polygon(diamond, Color("#ffffffcc"))
        _:
            draw_rect(Rect2(-12, -12, 24, 24), expression_color, true)

func _draw_oval(center: Vector2, radii: Vector2, color: Color) -> void:
    var points: PackedVector2Array = PackedVector2Array()
    for i in range(32):
        var angle: float = TAU * float(i) / 32.0
        points.append(center + Vector2(cos(angle) * radii.x, sin(angle) * radii.y))
    draw_colored_polygon(points, color)
