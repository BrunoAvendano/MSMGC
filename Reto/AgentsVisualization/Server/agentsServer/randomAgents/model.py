from mesa import Model
from mesa.time import RandomActivation
from mesa.space import SingleGrid
from .agent import PathfindingAgent, ObstacleAgent, TrafficLightAgent


class PathfindingModel(Model):
    """Modelo que utiliza un mapa para guiar a los agentes y controla los semáforos."""
    def __init__(self, N, width, height, map_data):
        super().__init__()
        self.num_agents = N
        self.grid = SingleGrid(width, height, torus=False)
        self.schedule = RandomActivation(self)
        self.map_data = map_data
        self.running = True
        self.step_count = 0  # Contador de pasos

        # Cargar el mapa desde los datos proporcionados
        self.load_map()

        # Crear agentes iniciales
        self.create_agents()

    def load_map(self):
        """Carga el mapa desde los datos proporcionados."""
        for y, row in enumerate(self.map_data):
            for x, cell in enumerate(row):
                if cell == '#':  # Obstáculo
                    obstacle = ObstacleAgent(f"obstacle-{x}-{y}", self)
                    self.grid.place_agent(obstacle, (x, y))
                elif cell == 'S':  # Semáforo grande
                    light = TrafficLightAgent(f"traffic_light_S_{x}_{y}", self, interval=15)
                    self.grid.place_agent(light, (x, y))
                    self.schedule.add(light)
                elif cell == 's':  # Semáforo pequeño
                    light = TrafficLightAgent(f"traffic_light_s_{x}_{y}", self, interval=5)
                    self.grid.place_agent(light, (x, y))
                    self.schedule.add(light)

    def create_agents(self):
        """Crea agentes iniciales en posiciones válidas con destinos válidos."""
        corners = self.get_valid_corners()
        destinations = self.get_destinations()

        if not destinations:
            return

        for i in range(self.num_agents):
            while True:
                start_position = self.random.choice(corners)
                # Puedes permitir múltiples agentes en la misma celda si lo deseas
                if len(self.grid.get_cell_list_contents(start_position)) < 5:  # Máximo 5 agentes por celda
                    break

            destination = self.random.choice(destinations)
            agent = PathfindingAgent(f"agent-{i}", self, destination)
            self.schedule.add(agent)
            self.grid.place_agent(agent, start_position)

    def get_valid_corners(self):
        """Devuelve una lista de esquinas válidas."""
        corners = [
            (0, 0),
            (self.grid.width - 1, 0),
            (0, self.grid.height - 1),
            (self.grid.width - 1, self.grid.height - 1)
        ]
        return corners

    def get_destinations(self):
        """Devuelve una lista de posiciones marcadas como destinos (D)."""
        return [
            (x, y)
            for y, row in enumerate(self.map_data)
            for x, cell in enumerate(row)
            if cell == 'D'
        ]

    def remove_agent(self, agent):
        """Elimina un agente que llegó a su destino y crea uno nuevo."""
        self.grid.remove_agent(agent)  # Asegúrate de eliminar el agente de la celda
        self.schedule.remove(agent)   # Eliminar el agente del scheduler

        # Crear un nuevo agente en una celda vacía
        self.add_agent()

    def add_agent(self):
        """Genera un nuevo agente en una esquina válida con un destino válido."""
        corners = self.get_valid_corners()
        destinations = self.get_destinations()

        if not destinations:
            return  # No hay destinos disponibles

        while True:
            start_position = self.random.choice(corners)
            if self.grid.is_cell_empty(start_position):  # Verificar que la celda esté vacía
                break

        destination = self.random.choice(destinations)
        new_agent = PathfindingAgent(f"agent-{self.num_agents}", self, destination)
        self.num_agents += 1
        self.schedule.add(new_agent)
        self.grid.place_agent(new_agent, start_position)

    def step(self):
        """Avanza la simulación un paso de tiempo."""
        self.schedule.step()  # Ejecutar un paso para todos los agentes
        self.step_count += 1  # Incrementar el contador de pasos

        # Generar un agente cada 5 pasos
        if self.step_count % 5 == 0:
            self.add_agent()

        # Eliminar agentes que llegan a su destino y regenerarlos
        agents_to_remove = [
            agent for agent in self.schedule.agents
            if isinstance(agent, PathfindingAgent) and agent.pos == agent.destination
        ]
        for agent in agents_to_remove:
            self.remove_agent(agent)
