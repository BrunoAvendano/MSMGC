from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from randomAgents.model import PathfindingModel
from randomAgents.agent import PathfindingAgent, ObstacleAgent, TrafficLightAgent
import traceback

# Path to map file
file_path = "2022_base.txt"

# Global variables
number_agents = 10
width = 28
height = 28
pathfindingModel = None
currentStep = 0
map_elements = {}
agents_completed = 0  # Counter for agents that reach their destination

# Flask app
app = Flask("Pathfinding Agents Example")
CORS(app)

# Function to load the map
def load_map(file_path):
    """Loads the map from a file."""
    try:
        with open(file_path, 'r') as f:
            map_data = [list(line.strip()) for line in f.readlines()]
        return map_data
    except Exception as e:
        print(f"Error loading map: {e}")
        return []

# Function to process the map
def process_map(map_data):
    """Processes the map and organizes its elements into a dictionary."""
    elements = {
        "destinations": [],  # Cells marked as 'D'
        "obstacles": [],     # Cells marked as '#'
        "lights_S": [],      # Large traffic lights 'S'
        "lights_s": [],      # Small traffic lights 's'
        "paths": {},         # Possible directions ('>', '<', '^', 'v')
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

# Load the initial map
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

        map_elements = process_map(map_data)  # Process the map

        if not map_elements["destinations"]:
            return jsonify({"message": "Error: No valid destinations found in the map."}), 400

        pathfindingModel = PathfindingModel(number_agents, width, height, map_data)
        print("Model initialized successfully.")
        return jsonify({"message": "Model successfully initialized."})
    except Exception as e:
        print(f"Error initializing model: {traceback.format_exc()}")
        return jsonify({"message": "Error initializing the model", "error": str(e)}), 500

@app.route('/getAgents', methods=['GET'])
@cross_origin()
def getAgents():
    try:
        if pathfindingModel is None:
            return jsonify({"message": "Error: The model is not initialized. Use /init first."}), 400

        print("Fetching agent positions...")
        agent_positions = []
        for agent in pathfindingModel.schedule.agents:
            if isinstance(agent, PathfindingAgent):
                print(f"Agent {agent.unique_id}: Pos {agent.pos}, Dest {agent.destination}")
                agent_positions.append({
                    "id": str(agent.unique_id),
                    "x": agent.pos[0],
                    "y": 1,  # For compatibility with 3D visualization
                    "z": agent.pos[1],
                    "destination": agent.destination
                })

        return jsonify({'positions': agent_positions})
    except Exception as e:
        print(f"Error getting agents: {traceback.format_exc()}")
        return jsonify({"message": "Error retrieving agent positions", "error": str(e)}), 500

@app.route('/update', methods=['GET'])
@cross_origin()
def updateModel():
    global currentStep, pathfindingModel, agents_completed
    try:
        if pathfindingModel is None:
            return jsonify({"message": "Error: The model is not initialized. Use /init first."}), 400

        print(f"Updating model at step {currentStep}")
        print(f"Active agents before step: {len(pathfindingModel.schedule.agents)}")

        # Debug agent states before stepping
        for agent in pathfindingModel.schedule.agents:
            if isinstance(agent, PathfindingAgent):
                print(f"Agent {agent.unique_id}: Position {agent.pos}, Destination {agent.destination}")

        # Step the model
        pathfindingModel.step()
        currentStep += 1
        print(f"Model stepped successfully to step {currentStep}")

        # Collect updated agent positions
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

        print(f"Active agents after step: {len(pathfindingModel.schedule.agents)}")
        return jsonify({
            'message': f'Model updated to step {currentStep}.',
            'currentStep': currentStep,
            'agents': agent_positions,
            'agents_completed': agents_completed,
            'active_agents': len(pathfindingModel.schedule.agents)
        })
    except Exception as e:
        print(f"Error during update: {traceback.format_exc()}")
        return jsonify({"message": "Error updating the model", "error": str(e)}), 500

@app.route('/addAgent', methods=['POST'])
@cross_origin()
def addAgent():
    global pathfindingModel
    try:
        if pathfindingModel is None:
            return jsonify({"message": "Error: The model is not initialized. Use /init first."}), 400

        corners = pathfindingModel.get_valid_corners()
        destinations = pathfindingModel.get_destinations()

        if not destinations:
            return jsonify({"message": "Error: No valid destinations found for the new agent."}), 400

        while True:
            start_position = pathfindingModel.random.choice(corners)
            if pathfindingModel.grid.is_cell_empty(start_position):
                break

        destination = pathfindingModel.random.choice(destinations)
        new_agent = PathfindingAgent(f"agent-{pathfindingModel.num_agents}", pathfindingModel, destination)
        pathfindingModel.num_agents += 1
        pathfindingModel.schedule.add(new_agent)
        pathfindingModel.grid.place_agent(new_agent, start_position)

        print(f"New agent {new_agent.unique_id} created at {start_position} with destination {destination}.")
        return jsonify({"message": f"New agent {new_agent.unique_id} created.", "id": new_agent.unique_id}), 200
    except Exception as e:
        print(f"Error adding agent: {traceback.format_exc()}")
        return jsonify({"message": "Error creating a new agent", "error": str(e)}), 500

@app.route('/getMap', methods=['GET'])
@cross_origin()
def getMap():
    try:
        return jsonify({"map": ["".join(row) for row in map_data]})
    except Exception as e:
        print(f"Error getting map: {traceback.format_exc()}")
        return jsonify({"message": "Error retrieving the map", "error": str(e)}), 500

@app.route('/gridStatus', methods=['GET'])
@cross_origin()
def gridStatus():
    """Returns the current state of the grid for debugging."""
    try:
        grid_data = {
            (x, y): [type(obj).__name__ for obj in pathfindingModel.grid.get_cell_list_contents((x, y))]
            for x in range(pathfindingModel.grid.width)
            for y in range(pathfindingModel.grid.height)
        }
        return jsonify({'grid': grid_data})
    except Exception as e:
        print(f"Error getting grid status: {traceback.format_exc()}")
        return jsonify({"message": "Error retrieving grid status", "error": str(e)}), 500

if __name__ == '__main__':
    app.run(host="localhost", port=8585, debug=False)
