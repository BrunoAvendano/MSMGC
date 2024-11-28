from mesa import Agent
import heapq


class PathfindingAgent(Agent):
    """Agente que sigue las direcciones del mapa para alcanzar su destino."""
    def __init__(self, unique_id, model, destination):
        super().__init__(unique_id, model)
        self.destination = destination
        self.path = []
        self.arrived = False  # Indica si el agente ha llegado a su destino

    def heuristic(self, a, b):
        """Calcula la distancia Manhattan entre dos puntos."""
        return abs(a[0] - b[0]) + abs(a[1] - b[1])

    def compute_path(self, start, goal):
        """Calcula el camino más corto respetando las direcciones del mapa."""
        grid = self.model.grid
        map_data = self.model.map_data

        directions_map = {
            '>': [(0, -1), (0, 1), (1, 0)],
            '<': [(0, -1), (0, 1), (-1, 0)],
            '^': [(0, -1), (1, 0), (-1, 0)],
            'v': [(0, 1), (1, 0), (-1, 0)],
        }

        frontier = []
        heapq.heappush(frontier, (0, start))
        came_from = {start: None}
        cost_so_far = {start: 0}

        while frontier:
            current_cost, current = heapq.heappop(frontier)

            if current == goal:
                break

            x, y = current
            if y >= len(map_data) or x >= len(map_data[y]):
                continue

            current_direction = map_data[y][x]
            neighbors = []

            if current_direction in directions_map:
                for dx, dy in directions_map[current_direction]:
                    neighbors.append((x + dx, y + dy))
            else:
                neighbors = [
                    (x + dx, y + dy)
                    for dx, dy in [(0, -1), (0, 1), (1, 0), (-1, 0)]
                ]

            for neighbor in neighbors:
                nx, ny = neighbor

                if grid.out_of_bounds(neighbor):
                    continue

                cell_contents = grid.get_cell_list_contents(neighbor)
                is_obstacle = any(isinstance(obj, ObstacleAgent) for obj in cell_contents)
                if is_obstacle:
                    continue

                new_cost = cost_so_far[current] + 1
                if neighbor not in cost_so_far or new_cost < cost_so_far[neighbor]:
                    cost_so_far[neighbor] = new_cost
                    priority = new_cost + self.heuristic(neighbor, goal)
                    heapq.heappush(frontier, (priority, neighbor))
                    came_from[neighbor] = current

        path = []
        current = goal
        while current and current in came_from:
            path.append(current)
            current = came_from[current]
        path.reverse()

        return path if path and path[0] == start else []

    def move(self):
        """Mueve al agente de acuerdo con el camino calculado."""
        if not self.path:
            return  # Si no hay camino, no hacer nada

        next_position = self.path[0]

        # Obtener el contenido de la celda
        cell_contents = self.model.grid.get_cell_list_contents(next_position)

        # Verificar si está ocupada excluyendo semáforos
        is_occupied = any(
            isinstance(obj, PathfindingAgent) and obj != self or isinstance(obj, ObstacleAgent) 
            for obj in cell_contents
            if not isinstance(obj, TrafficLightAgent)  # Ignorar semáforos
        )

        if is_occupied:
            self.wait_counter = getattr(self, 'wait_counter', 0) + 1
            if self.wait_counter > 5:  # Máximo número de pasos esperando
                self.path = self.compute_path(self.pos, self.destination)  # Recalcular camino
                self.wait_counter = 0  # Reiniciar contador
            return  # No se mueve, espera un paso

        # Si la celda no está ocupada, proceder al movimiento
        self.wait_counter = 0  # Reiniciar contador si se mueve
        self.path.pop(0)
        self.model.grid.move_agent(self, next_position)

    def step(self):
        """Calcula el camino o mueve al agente."""
        if not self.path and self.destination:
            self.path = self.compute_path(self.pos, self.destination)

        if self.path:
            self.move()

        if self.pos == self.destination:
            self.model.remove_agent(self)


class TrafficLightAgent(Agent):
    """Agente que representa un semáforo."""
    def __init__(self, unique_id, model, interval):
        super().__init__(unique_id, model)
        self.interval = interval
        self.state = "verde"
        self.step_count = 0

    def step(self):
        self.step_count += 1
        if self.step_count >= self.interval:
            self.state = "rojo" if self.state == "verde" else "verde"
            self.step_count = 0


class ObstacleAgent(Agent):
    """Agente que representa un obstáculo en el mapa."""
    def __init__(self, unique_id, model):
        super().__init__(unique_id, model)

    def step(self):
        pass
