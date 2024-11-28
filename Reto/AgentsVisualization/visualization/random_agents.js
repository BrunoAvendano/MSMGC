'use strict';

import * as twgl from 'twgl.js';
import GUI from 'lil-gui';

// Ruta del archivo de texto
const filePath = "2022_base.txt";

// Define the vertex shader code, using GLSL 3.00
const vsGLSL = `#version 300 es
in vec4 a_position;
in vec4 a_color;

uniform mat4 u_transforms;
uniform mat4 u_matrix;

out vec4 v_color;

void main() {
  gl_Position = u_matrix * a_position;
  v_color = a_color;
}
`;

// Define the fragment shader code, using GLSL 3.00
const fsGLSL = `#version 300 es
precision highp float;

in vec4 v_color;

out vec4 outColor;

void main() {
  outColor = v_color;
}
`;

// Define the Object3D class to represent 3D objects
class Object3D {
  constructor(id, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
    this.id = id;
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
    this.matrix = twgl.m4.create();
  }
}

// Define the agent server URI
const agent_server_uri = "http://localhost:8585/";

// Initialize arrays to store agents and obstacles
const agents = [];
const obstacles = [];

// Initialize WebGL-related variables
let gl, programInfo, agentArrays, obstacleArrays, agentsBufferInfo, obstaclesBufferInfo, agentsVao, obstaclesVao;

// Define the camera position
let cameraPosition = { x: 0, y: 15, z: 9 };

let blueCubesBufferInfo;

// Initialize the frame count
let frameCount = 0;

// Define the data object
let data = {
  NAgents: 1,
  width: 0, // Se inicializan como 0 y se actualizan después
  height: 0,
  file_path: filePath // Agregado para enviar la ruta del archivo al servidor
};

// Main function to initialize and run the application
async function main() {
  const canvas = document.querySelector("canvas");
  gl = canvas.getContext("webgl2");

  // Crear la información del programa usando los shaders
  programInfo = twgl.createProgramInfo(gl, [vsGLSL, fsGLSL]);

  // Leer el archivo y calcular filas y columnas
  const fileContent = await readFile();
  if (fileContent) {
    data.width = getColumnCount(fileContent) - 1;
    data.height = getRowCount(fileContent);

    console.log(`Número de filas en el archivo: ${data.height}`);
    console.log(`Número de columnas en el archivo: ${data.width}`);
  } else {
    console.error("El archivo no pudo ser leído o está vacío.");
    return;
  }

  // Detectar posiciones de símbolos especiales
  const specialPositions = getSpecialPositions(fileContent);
  const hashTagPositions = getHashTag(fileContent);

  // Generar datos del piso en base a esas posiciones
  const floorArrays = generateFloorDataFromPositions(specialPositions, 1);
  const blueCubesData = generateBlueCubesFromHashTags(hashTagPositions, 1);


  // Crear buffer y VAO para el piso
  const floorBufferInfo = twgl.createBufferInfoFromArrays(gl, floorArrays);
  const floorVao = twgl.createVAOFromBufferInfo(gl, programInfo, floorBufferInfo);
  const blueCubesBufferInfo = twgl.createBufferInfoFromArrays(gl, blueCubesData);
  const blueCubesVao = twgl.createVAOFromBufferInfo(gl, programInfo, blueCubesBufferInfo);

  const zebraPositions = getZebraCrossingPositions(fileContent);
  const zebraCrossingData = generateZebraCrossings(zebraPositions, 1);
  const zebraBufferInfo = twgl.createBufferInfoFromArrays(gl, zebraCrossingData);
  const zebraVao = twgl.createVAOFromBufferInfo(gl, programInfo, zebraBufferInfo);

  const redXPositions = getRedXPositions(fileContent);
  const redXData = generateRedX(redXPositions, 1);
  const redXBufferInfo = twgl.createBufferInfoFromArrays(gl, redXData);
  const redXVao = twgl.createVAOFromBufferInfo(gl, programInfo, redXBufferInfo);




  // Generar datos de agentes y obstáculos
  agentArrays = generateData(0.3);
  obstacleArrays = generateObstacleData(1);

  // Crear información de buffer
  agentsBufferInfo = twgl.createBufferInfoFromArrays(gl, agentArrays);
  obstaclesBufferInfo = twgl.createBufferInfoFromArrays(gl, obstacleArrays);

  // Crear VAOs
  agentsVao = twgl.createVAOFromBufferInfo(gl, programInfo, agentsBufferInfo);
  obstaclesVao = twgl.createVAOFromBufferInfo(gl, programInfo, obstaclesBufferInfo);

  // Configurar la UI
  setupUI();

  // Inicializar el modelo de agentes
  await initAgentsModel();

  // Obtener agentes y obstáculos
  await getAgents();
 // await getObstacles();

  // Llama a `addAgent` cada 5 segundos para generar nuevos agentes
  setInterval(async () => {
    await addAgent();
  }, 5000);

  // Dibujar la escena
  await drawScene(
    gl,
    programInfo,
    agentsVao,
    agentsBufferInfo,
    obstaclesVao,
    obstaclesBufferInfo,
    floorVao,
    floorBufferInfo,
    blueCubesVao,
    blueCubesBufferInfo,
    zebraVao,         // Añade zebraVao
    zebraBufferInfo,
    redXVao,         // Añade este parámetro
    redXBufferInfo 
  );
}



/*
 * Lee el archivo de texto desde la ruta especificada.
 * 
 * @returns {Promise<string>} El contenido del archivo como una cadena.
 */
async function readFile() {
  try {
    const response = await fetch(filePath);
    if (!response.ok) throw new Error(`Error al leer el archivo: ${response.status}`);
    const text = await response.text();
    return text || ""; // Devuelve una cadena vacía si no hay contenido
  } catch (error) {
    console.error("Error al leer el archivo:", error);
    return ""; // Asegúrate de que siempre devuelva un valor
  }
}
/*
 * Calcula el número de filas en el archivo.
 * 
 * @param {string} fileContent - El contenido del archivo.
 * @returns {number} El número de filas en el archivo.
 */
function getRowCount(fileContent) {
  if (!fileContent) return 0;
  const rows = fileContent.split("\n").filter(line => line.trim() !== "");
  return rows.length;
}

/*
 * Genera los datos de geometría para pasos de cebra (rectángulos blancos y negros).
 * 
 * @param {Array} positions - Lista de posiciones [{ x, z }].
 * @param {number} size - Tamaño de cada rectángulo de la cebra.
 * @returns {Object} Datos de posición, color e índices para los pasos de cebra.
 */
function generateZebraCrossings(positions, size) {
  const vertices = [];
  const colors = [];
  const indices = [];
  let vertexIndex = 0;

  positions.forEach(({ x, z }) => {
    
    const stripeCount = 6; // Número de franjas blancas y negras alternadas
    const stripeWidth = size / stripeCount;

    for (let i = 0; i < stripeCount; i++) {


      const baseX = x * size + 0.05 ;
      const baseZ = z * size + -0.35 + i * stripeWidth;

      // Color alternado entre blanco y negro
      const isWhite = i % 2 === 0;
      const color = isWhite ? [1, 1, 1, 1] : [0, 0, 0, 1];

      // Agregar vértices del rectángulo
      vertices.push(
        baseX - size / 2, 0, baseZ,                 // Inferior izquierda
        baseX + size / 2, 0, baseZ,                 // Inferior derecha
        baseX + size / 2, 0, baseZ + stripeWidth,   // Superior derecha
        baseX - size / 2, 0, baseZ + stripeWidth    // Superior izquierda
      );

      // Agregar colores
      for (let j = 0; j < 4; j++) {
        colors.push(...color);
      }

      // Agregar índices para los triángulos de la franja
      indices.push(
        vertexIndex, vertexIndex + 1, vertexIndex + 2, // Triángulo 1
        vertexIndex, vertexIndex + 2, vertexIndex + 3  // Triángulo 2
      );

      vertexIndex += 4; // Avanzar al siguiente conjunto de vértices
    }
  });

  return {
    a_position: { numComponents: 3, data: vertices },
    a_color: { numComponents: 4, data: colors },
    indices: { numComponents: 3, data: indices }
  };
}


/*
 * Genera los datos de geometría para una X roja en las posiciones dadas.
 * 
 * @param {Array} positions - Lista de posiciones [{ x, z }].
 * @param {number} size - Tamaño de la celda donde se dibuja la X.
 * @returns {Object} Datos de posición, color e índices para las X.
 */
function generateRedX(positions, size) {
  const vertices = [];
  const colors = [];
  const indices = [];
  let vertexIndex = 0;

  positions.forEach(({ x, z }) => {
    const centerX = x * size;
    const centerZ = z * size;
    const thickness = size * 0.3; // Grosor de las líneas de la X
    const halfSize = size / 2;

    // Coordenadas para la primera línea de la X
    vertices.push(
      centerX - halfSize, 0, centerZ - halfSize + thickness, // Inferior izquierda
      centerX - halfSize, 0, centerZ - halfSize,            // Superior izquierda
      centerX + halfSize, 0, centerZ + halfSize,            // Inferior derecha
      centerX + halfSize, 0, centerZ + halfSize - thickness // Superior derecha
    );

    // Coordenadas para la segunda línea de la X
    vertices.push(
      centerX + halfSize, 0, centerZ - halfSize + thickness, // Inferior derecha
      centerX + halfSize, 0, centerZ - halfSize,            // Superior derecha
      centerX - halfSize, 0, centerZ + halfSize,            // Inferior izquierda
      centerX - halfSize, 0, centerZ + halfSize - thickness // Superior izquierda
    );

    // Agregar colores (rojo)
    for (let i = 0; i < 8; i++) {
      colors.push(1, 0, 0, 1); // Rojo
    }

    // Índices para los triángulos de la primera línea de la X
    indices.push(
      vertexIndex, vertexIndex + 1, vertexIndex + 2, // Triángulo 1
      vertexIndex + 1, vertexIndex + 2, vertexIndex + 3 // Triángulo 2
    );

    // Índices para los triángulos de la segunda línea de la X
    indices.push(
      vertexIndex + 4, vertexIndex + 5, vertexIndex + 6, // Triángulo 3
      vertexIndex + 5, vertexIndex + 6, vertexIndex + 7 // Triángulo 4
    );

    vertexIndex += 8; // Avanzar al siguiente conjunto de vértices
  });

  return {
    a_position: { numComponents: 3, data: vertices },
    a_color: { numComponents: 4, data: colors },
    indices: { numComponents: 3, data: indices }
  };
}


/*
 * Detecta las posiciones en el archivo donde hay la letra 'D'.
 * 
 * @param {string} fileContent - Contenido del archivo.
 * @returns {Array} Lista de posiciones [{ x, z }]
 */
function getRedXPositions(fileContent) {
  const positions = [];
  const rows = fileContent.split("\n").filter(line => line.trim() !== "");

  rows.forEach((row, z) => {
    [...row].forEach((char, x) => {
      if (char === "D") {
        positions.push({ x, z });
      }
    });
  });

  return positions;
}


/*
 * Detecta las posiciones en el archivo donde hay los símbolos 's' y 'S'.
 * 
 * @param {string} fileContent - Contenido del archivo.
 * @returns {Array} Lista de posiciones [{ x, z }]
 */
function getZebraCrossingPositions(fileContent) {
  const positions = [];
  const rows = fileContent.split("\n").filter(line => line.trim() !== "");

  rows.forEach((row, z) => {
    [...row].forEach((char, x) => {
      if (["s", "S"].includes(char)) {
        positions.push({ x, z });
      }
    });
  });

  return positions;
}


/*
 * Calcula el número de columnas en el archivo.
 * 
 * @param {string} fileContent - El contenido del archivo.
 * @returns {number} El número de columnas en el archivo.
 */
function getColumnCount(fileContent) {
  if (!fileContent) return 0;
  const firstRow = fileContent.split("\n").find(line => line.trim() !== "");
  return firstRow ? firstRow.length : 0;
}

/*
 * Initializes the agents model by sending a POST request to the agent server.
 */
async function initAgentsModel() {
  try {
    let response = await fetch(agent_server_uri + "init", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data) // Enviar datos con la ruta del archivo
    });

    if (response.ok) {
      let result = await response.json();
      console.log(result.message);
    }
  } catch (error) {
    console.log(error);
  }
}

/*
 * Retrieves the current positions of all agents from the agent server.
 */
async function getAgents() {
  try {
    let response = await fetch(agent_server_uri + "getAgents");

    if (response.ok) {
      let result = await response.json();
      console.log(result.positions);

      // Crear un mapa de agentes existentes
      const existingAgents = new Map(agents.map(agent => [agent.id, agent]));

      // Crear un conjunto de IDs de agentes del servidor
      const serverAgentIds = new Set(result.positions.map(agent => agent.id));

      // Actualizar o agregar agentes desde el servidor
      for (const agent of result.positions) {
        if (existingAgents.has(agent.id)) {
          // Actualizar posición del agente existente
          const currentAgent = existingAgents.get(agent.id);
          currentAgent.position = [agent.x, agent.y, agent.z];
        } else {
          // Agregar nuevo agente
          const newAgent = new Object3D(agent.id, [agent.x, agent.y, agent.z]);
          agents.push(newAgent);
        }
      }

      // Eliminar agentes locales que ya no están en el servidor
      agents.forEach((agent, index) => {
        if (!serverAgentIds.has(agent.id)) {
          console.log(`Eliminando agente obsoleto: ${agent.id}`);
          agents.splice(index, 1);
        }
      });

      console.log("Agents sincronizados:", agents);
    }
  } catch (error) {
    console.log(error);
  }
}


/*
 * Retrieves the current positions of all obstacles from the agent server.

async function getObstacles() {
  try {
    let response = await fetch(agent_server_uri + "getObstacles");

    if (response.ok) {
      let result = await response.json();
      for (const obstacle of result.positions) {
        const newObstacle = new Object3D(obstacle.id, [obstacle.x, obstacle.y, obstacle.z]);
        obstacles.push(newObstacle);
      }
      console.log("Obstacles:", obstacles);
    }
  } catch (error) {
    console.log(error);
  }
}
 */
/*
 * Updates the agent positions by sending a request to the agent server.
 */
async function update() {
  try {
    // Send a request to the agent server to update the agent positions
    let response = await fetch(agent_server_uri + "update") 

    // Check if the response was successful
    if(response.ok){
      // Retrieve the updated agent positions
      await getAgents()
      // Log a message indicating that the agents have been updated
      console.log("Updated agents")
    }

  } catch (error) {
    // Log any errors that occur during the request
    console.log(error) 
  }
}
/*
 * Genera los datos de geometría para los segmentos de piso en las posiciones dadas.
 * 
 * @param {Array} positions - Lista de posiciones [{ x, z }].
 * @param {number} size - Tamaño de cada celda.
 * @returns {Object} Datos de posición, color e índices para el piso.
 */
function generateFloorDataFromPositions(positions, size) {
  const vertices = [];
  const colors = [];
  const indices = [];
  let vertexIndex = 0;

  positions.forEach(({ x, z }) => {
    // Coordenadas base para cada celda
    const offsetX = -0.5; // Ajusta este valor para mover hacia la izquierda
    const offsetY = -0.5;  // Ajusta este valor para mover hacia arriba
    const baseX = x * size + offsetX;
    const baseZ = z * size + offsetY; // Sin cambios para Z


    // Agregar vértices de la celda
    vertices.push(
      baseX, 0, baseZ,              // Inferior izquierda
      baseX + size, 0, baseZ,       // Inferior derecha
      baseX + size, 0, baseZ + size,// Superior derecha
      baseX, 0, baseZ + size        // Superior izquierda
    );

    // Agregar color (gris claro)
    colors.push(
      0.6, 0.6, 0.6, 1,  // Inferior izquierda
      0.6, 0.6, 0.6, 1,  // Inferior derecha
      0.6, 0.6, 0.6, 1,  // Superior derecha
      0.6, 0.6, 0.6, 1   // Superior izquierda
    );

    // Agregar índices para los triángulos de la celda
    indices.push(
      vertexIndex, vertexIndex + 1, vertexIndex + 2, // Triángulo 1
      vertexIndex, vertexIndex + 2, vertexIndex + 3  // Triángulo 2
    );

    vertexIndex += 4; // Avanzar al siguiente conjunto de vértices
  });

  return {
    a_position: { numComponents: 3, data: vertices },
    a_color: { numComponents: 4, data: colors },
    indices: { numComponents: 3, data: indices }
  };
}

function drawBlueCubes(vao, bufferInfo, viewProjectionMatrix) {
  gl.bindVertexArray(vao);

  const matrix = twgl.m4.identity();
  const uniforms = { u_matrix: viewProjectionMatrix };

  twgl.setUniforms(programInfo, uniforms);
  twgl.drawBufferInfo(gl, bufferInfo);
}



/*
 * Genera los datos de geometría para el piso.
 * @param {number} size Escala del piso.
 * @param {number} width Ancho del piso.
 * @param {number} height Altura del piso.
 * @returns {Object} Datos de posición, color e índices para el piso.
 */
function generateFloorData(size, width, height) {
  return {
    a_position: {
      numComponents: 3,
      data: [
        -width / 2, 0, -height / 2, // Bottom-left
        width / 2, 0, -height / 2, // Bottom-right
        width / 2, 0, height / 2, // Top-right
        -width / 2, 0, height / 2 // Top-left
      ].map(e => size * e)
    },
    a_color: {
      numComponents: 4,
      data: [
        0.6, 0.6, 0.6, 1, // Light gray
        0.6, 0.6, 0.6, 1,
        0.6, 0.6, 0.6, 1,
        0.6, 0.6, 0.6, 1
      ]
    },
    indices: {
      numComponents: 3,
      data: [0, 1, 2, 0, 2, 3] // Dos triángulos que forman el plano
    }
  };
}



/*
 * Dibuja el piso en la escena.
 * @param {WebGLVertexArrayObject} floorVao VAO del piso.
 * @param {Object} floorBufferInfo Información del buffer del piso.
 * @param {Float32Array} viewProjectionMatrix Matriz de vista-proyección.
 */
function drawFloor(floorVao, floorBufferInfo, viewProjectionMatrix) {
  gl.bindVertexArray(floorVao);

  // Matriz de transformación para el piso
  let floorMatrix = twgl.m4.identity();
  let uniforms = {
    u_matrix: twgl.m4.multiply(viewProjectionMatrix, floorMatrix)
  };

  // Establecer los uniformes y dibujar
  twgl.setUniforms(programInfo, uniforms);
  twgl.drawBufferInfo(gl, floorBufferInfo);
}

/*
 * Detecta las posiciones en el archivo donde hay los símbolos <, >, v, ^.
 * 
 * @param {string} fileContent - Contenido del archivo.
 * @returns {Array} Lista de posiciones [{ x, z }]
 */
function getSpecialPositions(fileContent) {
  const positions = [];
  const rows = fileContent.split("\n").filter(line => line.trim() !== "");

  rows.forEach((row, z) => {
    [...row].forEach((char, x) => {
      if (["<", ">", "v", "^"].includes(char)) {
        positions.push({ x, z });
      }
    });
  });

  return positions;
}
/*
 * Genera los datos de geometría para los cubos azules en las posiciones de hashtags (#).
 *
 * @param {Array} positions - Lista de posiciones [{ x, z }].
 * @param {number} size - Tamaño de cada cubo.
 * @returns {Object} Datos de posición, color e índices para los cubos azules.
 */
function generateBlueCubesFromHashTags(positions, size) {
  const vertices = [];
  const colors = [];
  const indices = [];
  let vertexIndex = 0;

  positions.forEach(({ x, z }) => {
    const baseX = x * size;
    const baseZ = z * size;
    const height = size * (2 + Math.random() * 3); // Altura variable entre 2x y 5x del tamaño base
    
    // Agregar vértices del cubo
    vertices.push(
      baseX - size / 2, 0, baseZ - size / 2,  // Inferior izquierda frente
      baseX + size / 2, 0, baseZ - size / 2,  // Inferior derecha frente
      baseX + size / 2, height, baseZ - size / 2,  // Superior derecha frente
      baseX - size / 2, height, baseZ - size / 2,  // Superior izquierda frente
    
      baseX - size / 2, 0, baseZ + size / 2,  // Inferior izquierda atrás
      baseX + size / 2, 0, baseZ + size / 2,  // Inferior derecha atrás
      baseX + size / 2, height, baseZ + size / 2,  // Superior derecha atrás
      baseX - size / 2, height, baseZ + size / 2   // Superior izquierda atrás
    );

    // Agregar colores (azul)
    for (let i = 0; i < 8; i++) {
      if (i % 2 === 0) {
        colors.push(0.2, 0.2, 1, 1); // Azul oscuro
      } else {
        colors.push(0.6, 0.6, 1, 1); // Azul claro
      }
    }

    

    // Agregar índices para formar los triángulos del cubo
    const offset = vertexIndex;
    indices.push(
      // Frente
      offset, offset + 1, offset + 2,
      offset, offset + 2, offset + 3,
      // Atrás
      offset + 4, offset + 5, offset + 6,
      offset + 4, offset + 6, offset + 7,
      // Izquierda
      offset, offset + 4, offset + 7,
      offset, offset + 7, offset + 3,
      // Derecha
      offset + 1, offset + 5, offset + 6,
      offset + 1, offset + 6, offset + 2,
      // Abajo
      offset, offset + 1, offset + 5,
      offset, offset + 5, offset + 4,
      // Arriba
      offset + 3, offset + 2, offset + 6,
      offset + 3, offset + 6, offset + 7
    );

    vertexIndex += 8;
  });

  return {
    a_position: { numComponents: 3, data: vertices },
    a_color: { numComponents: 4, data: colors },
    indices: { numComponents: 3, data: indices }
  };
}

function getHashTag(fileContent) {
  const positions = [];
  const rows = fileContent.split("\n").filter(line => line.trim() !== "");

  rows.forEach((row, z) => {
    [...row].forEach((char, x) => {
      if (["#"].includes(char)) {
        positions.push({ x, z });
      }
    });
  });

  return positions;
}

/*
 * Draws the scene by rendering the agents and obstacles.
 * 
 * @param {WebGLRenderingContext} gl - The WebGL rendering context.
 * @param {Object} programInfo - The program information.
 * @param {WebGLVertexArrayObject} agentsVao - The vertex array object for agents.
 * @param {Object} agentsBufferInfo - The buffer information for agents.
 * @param {WebGLVertexArrayObject} obstaclesVao - The vertex array object for obstacles.
 * @param {Object} obstaclesBufferInfo - The buffer information for obstacles.
 */
/*
 * Dibuja la escena completa (incluye agentes, obstáculos y piso).
 */
async function drawScene(
  gl,
  programInfo,
  agentsVao,
  agentsBufferInfo,
  obstaclesVao,
  obstaclesBufferInfo,
  floorVao,
  floorBufferInfo,
  blueCubesVao,
  blueCubesBufferInfo,
  zebraVao,         // Añade zebraVao
  zebraBufferInfo,
  redXVao,         // Añade este parámetro
  redXBufferInfo 
) {
  twgl.resizeCanvasToDisplaySize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  gl.clearColor(0.2, 0.2, 0.2, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(programInfo.program);
  const viewProjectionMatrix = setupWorldView(gl);

  // En la función `drawScene`:
  drawBlueCubes(blueCubesVao, blueCubesBufferInfo, viewProjectionMatrix);
  drawBlueCubes(zebraVao, zebraBufferInfo, viewProjectionMatrix);
  drawBlueCubes(redXVao, redXBufferInfo, viewProjectionMatrix);


  drawFloor(floorVao, floorBufferInfo, viewProjectionMatrix); // Dibuja el piso
  drawAgents(1, agentsVao, agentsBufferInfo, viewProjectionMatrix);
  drawObstacles(1, obstaclesVao, obstaclesBufferInfo, viewProjectionMatrix);

  frameCount++;

  if (frameCount % 30 === 0) {
    await update();
  }
// No reiniciar `frameCount` aquí


  requestAnimationFrame(() =>
    drawScene(
      gl,
      programInfo,
      agentsVao,
      agentsBufferInfo,
      obstaclesVao,
      obstaclesBufferInfo,
      floorVao,
      floorBufferInfo,
      blueCubesVao,
      blueCubesBufferInfo,
      zebraVao,         // Añade zebraVao
      zebraBufferInfo,
      redXVao,         // Añade este parámetro
      redXBufferInfo 
    )
  );
}


/*
 * Draws the agents.
 * 
 * @param {Number} distance - The distance for rendering.
 * @param {WebGLVertexArrayObject} agentsVao - The vertex array object for agents.
 * @param {Object} agentsBufferInfo - The buffer information for agents.
 * @param {Float32Array} viewProjectionMatrix - The view-projection matrix.
 */
function drawAgents(distance, agentsVao, agentsBufferInfo, viewProjectionMatrix){
    // Bind the vertex array object for agents
    gl.bindVertexArray(agentsVao);

    // Iterate over the agents
    for(const agent of agents){

      // Create the agent's transformation matrix
      const cube_trans = twgl.v3.create(...agent.position);
      const cube_scale = twgl.v3.create(...agent.scale);

      // Calculate the agent's matrix
      agent.matrix = twgl.m4.translate(viewProjectionMatrix, cube_trans);
      agent.matrix = twgl.m4.rotateX(agent.matrix, agent.rotation[0]);
      agent.matrix = twgl.m4.rotateY(agent.matrix, agent.rotation[1]);
      agent.matrix = twgl.m4.rotateZ(agent.matrix, agent.rotation[2]);
      agent.matrix = twgl.m4.scale(agent.matrix, cube_scale);

      // Set the uniforms for the agent
      let uniforms = {
          u_matrix: agent.matrix,
      }

      // Set the uniforms and draw the agent
      twgl.setUniforms(programInfo, uniforms);
      twgl.drawBufferInfo(gl, agentsBufferInfo);
      
    }
}

      
/*
 * Draws the obstacles.
 * 
 * @param {Number} distance - The distance for rendering.
 * @param {WebGLVertexArrayObject} obstaclesVao - The vertex array object for obstacles.
 * @param {Object} obstaclesBufferInfo - The buffer information for obstacles.
 * @param {Float32Array} viewProjectionMatrix - The view-projection matrix.
 */
function drawObstacles(distance, obstaclesVao, obstaclesBufferInfo, viewProjectionMatrix){
    // Bind the vertex array object for obstacles
    gl.bindVertexArray(obstaclesVao);

    // Iterate over the obstacles
    for(const obstacle of obstacles){
      // Create the obstacle's transformation matrix
      const cube_trans = twgl.v3.create(...obstacle.position);
      const cube_scale = twgl.v3.create(...obstacle.scale);

      // Calculate the obstacle's matrix
      obstacle.matrix = twgl.m4.translate(viewProjectionMatrix, cube_trans);
      obstacle.matrix = twgl.m4.rotateX(obstacle.matrix, obstacle.rotation[0]);
      obstacle.matrix = twgl.m4.rotateY(obstacle.matrix, obstacle.rotation[1]);
      obstacle.matrix = twgl.m4.rotateZ(obstacle.matrix, obstacle.rotation[2]);
      obstacle.matrix = twgl.m4.scale(obstacle.matrix, cube_scale);

      // Set the uniforms for the obstacle
      let uniforms = {
          u_matrix: obstacle.matrix,
      }

      // Set the uniforms and draw the obstacle
      twgl.setUniforms(programInfo, uniforms);
      twgl.drawBufferInfo(gl, obstaclesBufferInfo);
      
    }
}

/*
 * Sets up the world view by creating the view-projection matrix.
 * 
 * @param {WebGLRenderingContext} gl - The WebGL rendering context.
 * @returns {Float32Array} The view-projection matrix.
 */
function setupWorldView(gl) {
    // Set the field of view (FOV) in radians
    const fov = 45 * Math.PI / 180;

    // Calculate the aspect ratio of the canvas
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;

    // Create the projection matrix
    const projectionMatrix = twgl.m4.perspective(fov, aspect, 1, 200);

    // Set the target position
    const target = [data.width/2, 0, data.height/2];

    // Set the up vector
    const up = [0, 1, 0];

    // Calculate the camera position
    const camPos = twgl.v3.create(cameraPosition.x + data.width/2, cameraPosition.y, cameraPosition.z+data.height/2)

    // Create the camera matrix
    const cameraMatrix = twgl.m4.lookAt(camPos, target, up);

    // Calculate the view matrix
    const viewMatrix = twgl.m4.inverse(cameraMatrix);

    // Calculate the view-projection matrix
    const viewProjectionMatrix = twgl.m4.multiply(projectionMatrix, viewMatrix);

    // Return the view-projection matrix
    return viewProjectionMatrix;
}

async function addAgent() {
  try {
    let response = await fetch(agent_server_uri + "addAgent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (response.ok) {
      let result = await response.json();
      console.log(result.message);
      // Después de agregar un nuevo agente, obtenemos la lista actualizada
      await getAgents();
    }
  } catch (error) {
    console.log("Error al crear un nuevo agente:", error);
  }
}

/*
 * Sets up the user interface (UI) for the camera position.
 */
function setupUI() {
    // Create a new GUI instance
    const gui = new GUI();

    // Create a folder for the camera position
    const posFolder = gui.addFolder('Position:')

    // Add a slider for the x-axis
    posFolder.add(cameraPosition, 'x', -50, 50)
        .onChange( value => {
            // Update the camera position when the slider value changes
            cameraPosition.x = value
        });

    // Add a slider for the y-axis
    posFolder.add( cameraPosition, 'y', -50, 50)
        .onChange( value => {
            // Update the camera position when the slider value changes
            cameraPosition.y = value
        });

    // Add a slider for the z-axis
    posFolder.add( cameraPosition, 'z', -50, 50)
        .onChange( value => {
            // Update the camera position when the slider value changes
            cameraPosition.z = value
        });
}

function generateData(size) {
  const carLength = size * 2.5; // Largo del coche
  const carWidth = size * 1.2; // Ancho del coche
  const carHeight = size * 0.6; // Altura de la carrocería
  const cabinHeight = size * 0.4; // Altura de la cabina
  const wheelRadius = size * 0.3; // Tamaño de las ruedas
  const wheelWidth = size * 0.2; // Grosor de las ruedas

  const vertices = [];
  const colors = [];
  const indices = [];
  let vertexIndex = 0;

  // Carrocería
  const bodyVertices = [
      // Parte superior de la carrocería
      -carWidth / 2, carHeight, -carLength / 2,
       carWidth / 2, carHeight, -carLength / 2,
       carWidth / 2, carHeight,  carLength / 2,
      -carWidth / 2, carHeight,  carLength / 2,

      // Parte inferior de la carrocería
      -carWidth / 2, 0, -carLength / 2,
       carWidth / 2, 0, -carLength / 2,
       carWidth / 2, 0,  carLength / 2,
      -carWidth / 2, 0,  carLength / 2,
  ];

  const bodyColors = [
      // Colores de la carrocería (rojo)
      1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1,
      1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1
  ];

  const bodyIndices = [
      // Parte superior
      0, 1, 2, 0, 2, 3,
      // Parte inferior
      4, 5, 6, 4, 6, 7,
      // Laterales
      0, 1, 5, 0, 5, 4,
      1, 2, 6, 1, 6, 5,
      2, 3, 7, 2, 7, 6,
      3, 0, 4, 3, 4, 7
  ];

  vertices.push(...bodyVertices);
  colors.push(...bodyColors);
  indices.push(...bodyIndices.map(index => index + vertexIndex));
  vertexIndex += 8;

  // Cabina
  const cabinVertices = [
      -carWidth / 3, carHeight + cabinHeight, -carLength / 4,
       carWidth / 3, carHeight + cabinHeight, -carLength / 4,
       carWidth / 3, carHeight, carLength / 4,
      -carWidth / 3, carHeight, carLength / 4,
  ];

  const cabinColors = [
      // Colores de la cabina (azul claro)
      0.6, 0.8, 1, 1, 0.6, 0.8, 1, 1, 0.6, 0.8, 1, 1, 0.6, 0.8, 1, 1
  ];

  const cabinIndices = [
      0, 1, 2, 0, 2, 3
  ];

  vertices.push(...cabinVertices);
  colors.push(...cabinColors);
  indices.push(...cabinIndices.map(index => index + vertexIndex));
  vertexIndex += 4;

  // Ruedas
  const wheelOffsets = [
      [-carWidth / 2, -wheelWidth / 2, -carLength / 2],
      [carWidth / 2, -wheelWidth / 2, -carLength / 2],
      [-carWidth / 2, -wheelWidth / 2, carLength / 2],
      [carWidth / 2, -wheelWidth / 2, carLength / 2]
  ];

  wheelOffsets.forEach(([x, y, z]) => {
      const wheelVertices = [
          x - wheelRadius, y, z - wheelRadius,
          x + wheelRadius, y, z - wheelRadius,
          x + wheelRadius, y, z + wheelRadius,
          x - wheelRadius, y, z + wheelRadius
      ];

      const wheelColors = [
          // Colores de las ruedas (negro)
          0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1
      ];

      const wheelIndices = [
          0, 1, 2, 0, 2, 3
      ];

      vertices.push(...wheelVertices);
      colors.push(...wheelColors);
      indices.push(...wheelIndices.map(index => index + vertexIndex));
      vertexIndex += 4;
  });

  return {
      a_position: { numComponents: 3, data: vertices },
      a_color: { numComponents: 4, data: colors },
      indices: { numComponents: 3, data: indices }
  };
}

function generateObstacleData(size){

    let arrays =
    {
        a_position: {
                numComponents: 3,
                data: [
                  // Front Face
                  -0.5, -0.5,  0.5,
                  0.5, -0.5,  0.5,
                  0.5,  0.5,  0.5,
                 -0.5,  0.5,  0.5,

                 // Back face
                 -0.5, -0.5, -0.5,
                 -0.5,  0.5, -0.5,
                  0.5,  0.5, -0.5,
                  0.5, -0.5, -0.5,

                 // Top face
                 -0.5,  0.5, -0.5,
                 -0.5,  0.5,  0.5,
                  0.5,  0.5,  0.5,
                  0.5,  0.5, -0.5,

                 // Bottom face
                 -0.5, -0.5, -0.5,
                  0.5, -0.5, -0.5,
                  0.5, -0.5,  0.5,
                 -0.5, -0.5,  0.5,

                 // Right face
                  0.5, -0.5, -0.5,
                  0.5,  0.5, -0.5,
                  0.5,  0.5,  0.5,
                  0.5, -0.5,  0.5,

                 // Left face
                 -0.5, -0.5, -0.5,
                 -0.5, -0.5,  0.5,
                 -0.5,  0.5,  0.5,
                 -0.5,  0.5, -0.5
                ].map(e => size * e)
            },
        a_color: {
                numComponents: 4,
                data: [
                  // Front face
                    0, 0, 0, 1, // v_1
                    0, 0, 0, 1, // v_1
                    0, 0, 0, 1, // v_1
                    0, 0, 0, 1, // v_1
                  // Back Face
                    0.333, 0.333, 0.333, 1, // v_2
                    0.333, 0.333, 0.333, 1, // v_2
                    0.333, 0.333, 0.333, 1, // v_2
                    0.333, 0.333, 0.333, 1, // v_2
                  // Top Face
                    0.5, 0.5, 0.5, 1, // v_3
                    0.5, 0.5, 0.5, 1, // v_3
                    0.5, 0.5, 0.5, 1, // v_3
                    0.5, 0.5, 0.5, 1, // v_3
                  // Bottom Face
                    0.666, 0.666, 0.666, 1, // v_4
                    0.666, 0.666, 0.666, 1, // v_4
                    0.666, 0.666, 0.666, 1, // v_4
                    0.666, 0.666, 0.666, 1, // v_4
                  // Right Face
                    0.833, 0.833, 0.833, 1, // v_5
                    0.833, 0.833, 0.833, 1, // v_5
                    0.833, 0.833, 0.833, 1, // v_5
                    0.833, 0.833, 0.833, 1, // v_5
                  // Left Face
                    1, 1, 1, 1, // v_6
                    1, 1, 1, 1, // v_6
                    1, 1, 1, 1, // v_6
                    1, 1, 1, 1, // v_6
                ]
            },
        indices: {
                numComponents: 3,
                data: [
                  0, 1, 2,      0, 2, 3,    // Front face
                  4, 5, 6,      4, 6, 7,    // Back face
                  8, 9, 10,     8, 10, 11,  // Top face
                  12, 13, 14,   12, 14, 15, // Bottom face
                  16, 17, 18,   16, 18, 19, // Right face
                  20, 21, 22,   20, 22, 23  // Left face
                ]
            }
    };
    return arrays;
}

main()
