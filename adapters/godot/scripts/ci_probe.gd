extends SceneTree

func _init() -> void:
    var package := _load_json("res://generated/first-grove.world-package.json")
    var expected := _load_json("res://generated/reference-parity.json")
    if package.is_empty() or expected.is_empty():
        push_error("Godot parity probe requires generated package and reference parity fixture")
        quit(2)
        return

    var laws: Dictionary = package.get("laws", {})
    var scenario: Dictionary = expected.get("fixture", {})
    var observed := {
        "CLEAR": _projection(laws, scenario, "CLEAR"),
        "RAIN": _projection(laws, scenario, "RAIN")
    }
    var matches := _same_projection(observed.get("CLEAR", {}), expected.get("expected", {}).get("CLEAR", {})) and _same_projection(observed.get("RAIN", {}), expected.get("expected", {}).get("RAIN", {}))
    var receipt := {
        "schemaVersion": "vexworld.godot-parity-receipt/v1",
        "adapterRef": "adapter.vexworld.godot.first-grove.v0",
        "scenarioRef": expected.get("scenarioRef", "UNKNOWN"),
        "sourcePackageRef": package.get("packageRef", "UNKNOWN"),
        "sourcePackageFingerprint": package.get("integrityFingerprint", "UNKNOWN"),
        "referenceImplementation": "versions/v1/src/core/resource-state.mjs",
        "godotImplementation": "adapters/godot/scripts/ci_probe.gd",
        "expected": expected.get("expected", {}),
        "observed": observed,
        "preservedSemanticRefs": [
            "law.first-grove.v0",
            "scenario.first-grove.rain-restoration"
        ],
        "approximatedSemanticRefs": [],
        "unsupportedSemanticRefs": [],
        "knownDivergenceRefs": [],
        "match": matches
    }
    DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://artifacts"))
    var file := FileAccess.open("res://artifacts/parity-receipt.json", FileAccess.WRITE)
    file.store_string(JSON.stringify(receipt, "  "))
    file.close()
    print("VEXWORLD_GODOT_PARITY=" + JSON.stringify(receipt))
    quit(0 if matches else 3)

func _load_json(path: String) -> Dictionary:
    if not FileAccess.file_exists(path):
        return {}
    var file := FileAccess.open(path, FileAccess.READ)
    var parsed = JSON.parse_string(file.get_as_text())
    return parsed if parsed is Dictionary else {}

func _projection(laws: Dictionary, fixture: Dictionary, weather: String) -> Dictionary:
    var resource: Dictionary = laws.get("resource", {})
    var movement: Dictionary = laws.get("movement", {})
    var distance := float(fixture.get("restorationDistance", 620.0))
    var energy := float(fixture.get("companionEnergy", 38.0))
    var max_energy := float(resource.get("maxEnergy", 100.0))
    var reserve := float(resource.get("requiredReserve", 12.0))
    var speed := max(1.0, float(movement.get("companionSpeed", 225.0)))
    var distance_cost := (distance / speed) * float(resource.get("moveCostPerSecond", 0.45)) * 3.2
    var predicted := distance_cost * _weather_multiplier(weather, resource) * _terrain_multiplier(weather)
    var contingency := max(3.0, predicted * 0.2)
    var margin := energy - predicted - contingency - reserve
    predicted = snappedf(predicted, 0.01)
    margin = snappedf(margin, 0.01)
    return {
        "predictedReturnCost": predicted,
        "returnMargin": margin,
        "band": _classify_margin(margin, max_energy, reserve)
    }

func _weather_multiplier(weather: String, resource: Dictionary) -> float:
    match weather:
        "RAIN": return float(resource.get("rainMultiplier", 1.35))
        "SNOW": return 1.45
        "SAND_WIND": return 1.55
        "MIST": return 1.1
        _: return 1.0

func _terrain_multiplier(weather: String) -> float:
    if weather == "RAIN": return 1.15
    if weather == "SNOW": return 1.25
    return 1.0

func _classify_margin(margin: float, max_energy: float, required_reserve: float) -> String:
    if margin <= 0.0: return "PROTECTIVE_RETURN_OR_HALT"
    var ratio := margin / max(1.0, max_energy)
    if margin <= required_reserve * 0.65 or ratio <= 0.08: return "RETURN_MARGIN_LOW"
    if ratio <= 0.2: return "RESTORATION_RECOMMENDED"
    if ratio <= 0.38: return "RESTORATION_AWARE"
    return "AVAILABLE_MARGIN"

func _same_projection(left: Dictionary, right: Dictionary) -> bool:
    return abs(float(left.get("predictedReturnCost", -999.0)) - float(right.get("predictedReturnCost", 999.0))) < 0.011 and abs(float(left.get("returnMargin", -999.0)) - float(right.get("returnMargin", 999.0))) < 0.011 and str(left.get("band", "")) == str(right.get("band", "!"))
