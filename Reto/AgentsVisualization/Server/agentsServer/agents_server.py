from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from randomAgents.model import PathfindingModel
from randomAgents.agent import PathfindingAgent, ObstacleAgent, TrafficLightAgent
import traceback

# Ruta del archivo de mapa
file_path = "2022_base.txt"

# Variables globales
number_agents = 10
width = 28
height = 28
pathfindingModel = None
currentStep = 0
map_elements = {}

# Flask app
app = Flask("Pathfinding Agents Example")
CORS(app)

# Función para leer el archivo de mapa
def load_map(file_path):
    """Carga el mapa desde un archivo."""
    try:
        with open(file_path, 'r') as f:
            map_data = [list(line.strip()) for line in f.readlines()]
        return map_data
    except Exception as e:
        return []

# Función para procesar el mapa
def process_map(map_data):
    """
    Procesa el mapa y organiza sus elementos en un diccionario.
    :param map_data: Lista bidimensional representando el mapa.
    :return: Diccionario con elementos categorizados (destinos, obstáculos, direcciones, semáforos, etc.).
    """
    elements = {
        "destinations": [],  # Celdas marcadas como 'D'
        "obstacles": [],     # Celdas marcadas como '#'
        "lights_S": [],      # Semáforos grandes 'S'
        "lights_s": [],      # Semáforos pequeños 's'
        "paths": {},         # Direcciones posibles ('>', '<', '^', 'v')
    }

    for y, row in enumerate(map_data):
        for x, cell in enumerate(row):
            if cell == 'D':
                elements["destinations"].append((x, y))
            elif cell == '#':
                elements["obstacles"].append((x, y))
            elif cell == 'S':
                elements["lights_S"].append((x, y))
            elif cell == 's':
                elements["lights_s"].append((x, y))
            elif cell in ['>', '<', '^', 'v']:
                elements["paths"][(x, y)] = cell

    return elements

# Leer el mapa inicial
map_data = load_map(file_path)

@app.route('/init', methods=['POST'])
@cross_origin()
def initModel():
    global currentStep, pathfindingModel, number_agents, width, height, map_data, map_elements

    try:
        number_agents = int(request.json.get('NAgents'))
        width = int(request.json.get('width'))
        height = int(request.json.get('height'))
        currentStep = 0

        map_elements = process_map(map_data)  # Procesar el mapa

        if not map_elements["destinations"]:
            return jsonify({"message": "Error: No se encontraron destinos válidos en el mapa."}), 400

        pathfindingModel = PathfindingModel(number_agents, width, height, map_data)
        return jsonify({"message": "Modelo inicializado correctamente."})
    except Exception as e:
        return jsonify({"message": "Error inicializando el modelo", "error": str(e)}), 500

@app.route('/getAgents', methods=['GET'])
@cross_origin()
def getAgents():
    try:
        if pathfindingModel is None:
            return jsonify({"message": "Error: El modelo no está inicializado. Usa /init primero."}), 400

        agent_positions = [
            {
                "id": str(agent.unique_id),
                "x": agent.pos[0],
                "y": 1,
                "z": agent.pos[1],
                "destination": agent.destination
            }
            for agent in pathfindingModel.schedule.agents
            if isinstance(agent, PathfindingAgent)
        ]
        return jsonify({'positions': agent_positions})
    except Exception as e:
        return jsonify({"message": "Error obteniendo posiciones de agentes", "error": str(e)}), 500

@app.route('/update', methods=['GET'])
@cross_origin()
def updateModel():
    global currentStep, pathfindingModel
    try:
        if pathfindingModel is None:
            return jsonify({"message": "Error: El modelo no está inicializado. Usa /init primero."}), 400

        pathfindingModel.step()
        currentStep += 1

        agent_positions = [
            {
                "id": str(agent.unique_id),
                "current_position": agent.pos,
                "destination": agent.destination,
                "path_remaining": agent.path
            }
            for agent in pathfindingModel.schedule.agents
            if isinstance(agent, PathfindingAgent)
        ]

        agents_to_remove = [
            agent for agent in pathfindingModel.schedule.agents
            if isinstance(agent, PathfindingAgent) and agent.pos == agent.destination
        ]
        for agent in agents_to_remove:
            pathfindingModel.grid.remove_agent(agent)
            pathfindingModel.schedule.remove(agent)

        return jsonify({'message': f'Model updated to step {currentStep}.', 'currentStep': currentStep, 'agents': agent_positions})
    except Exception as e:
        return jsonify({"message": "Error actualizando el modelo", "error": str(e)}), 500

@app.route('/addAgent', methods=['POST'])
@cross_origin()
def addAgent():
    global pathfindingModel
    try:
        if pathfindingModel is None:
            return jsonify({"message": "Error: El modelo no está inicializado. Usa /init primero."}), 400

        corners = pathfindingModel.get_valid_corners()
        destinations = pathfindingModel.get_destinations()

        if not destinations:
            return jsonify({"message": "Error: No se encontraron destinos válidos para el nuevo agente."}), 400

        while True:
            start_position = pathfindingModel.random.choice(corners)
            if pathfindingModel.grid.is_cell_empty(start_position):
                break

        destination = pathfindingModel.random.choice(destinations)
        new_agent = PathfindingAgent(f"agent-{pathfindingModel.num_agents}", pathfindingModel, destination)
        pathfindingModel.num_agents += 1
        pathfindingModel.schedule.add(new_agent)
        pathfindingModel.grid.place_agent(new_agent, start_position)

        return jsonify({"message": f"Nuevo agente {new_agent.unique_id} creado.", "id": new_agent.unique_id}), 200
    except Exception as e:
        return jsonify({"message": "Error al crear un nuevo agente", "error": str(e)}), 500

@app.route('/getMap', methods=['GET'])
@cross_origin()
def getMap():
    try:
        return jsonify({"map": ["".join(row) for row in map_data]})
    except Exception as e:
        return jsonify({"message": "Error obteniendo el mapa", "error": str(e)}), 500

@app.route('/gridStatus', methods=['GET'])
@cross_origin()
def gridStatus():
    """Devuelve el estado actual de la grid para depuración."""
    try:
        grid_data = {
            (x, y): [type(obj).__name__ for obj in pathfindingModel.grid.get_cell_list_contents((x, y))]
            for x in range(pathfindingModel.grid.width)
            for y in range(pathfindingModel.grid.height)
        }
        return jsonify({'grid': grid_data})
    except Exception as e:
        return jsonify({"message": "Error obteniendo el estado de la grid", "error": str(e)}), 500

if __name__ == '__main__':
    app.run(host="localhost", port=8585, debug=False)
