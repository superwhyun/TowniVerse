import { TILE_WIDTH, TILE_HEIGHT } from "./constants.js";

export function createCalibrator() {
  const modal = document.getElementById("calibration-modal");
  const canvas = document.getElementById("calibration-canvas");
  const hint = document.getElementById("calibration-hint");
  const confirmBtn = document.getElementById("calibration-confirm");
  const skipBtn = document.getElementById("calibration-skip");
  const resetBtn = document.getElementById("calibration-reset");
  const ctx = canvas.getContext("2d");
  const ORDER = ["하단", "왼쪽", "오른쪽", "상단"];

  let resolveFn = null;
  let image = null;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let points = [];
  let currentGridWidth = 1;
  let currentGridHeight = 1;

  canvas.addEventListener("click", (event) => {
    if (!image || points.length >= 4) return;
    const rect = canvas.getBoundingClientRect();
    const ratioX = canvas.width / rect.width;
    const ratioY = canvas.height / rect.height;
    const canvasX = (event.clientX - rect.left) * ratioX;
    const canvasY = (event.clientY - rect.top) * ratioY;
    const imgX = (canvasX - offsetX) / scale;
    const imgY = (canvasY - offsetY) / scale;
    points.push({
      x: Math.max(0, Math.min(image.width, imgX)),
      y: Math.max(0, Math.min(image.height, imgY)),
      canvasX,
      canvasY,
    });
    drawOverlay();
    updateHint();
  });

  resetBtn.addEventListener("click", () => {
    points = [];
    drawOverlay();
    updateHint();
  });

  skipBtn.addEventListener("click", () => {
    close(null);
  });

  confirmBtn.addEventListener("click", async () => {
    if (!image || points.length < 4) return;
    try {
      const ordered = {
        top: points[3],
        right: points[2],
        bottom: points[0],
        left: points[1],
      };

      const diamondWidth = TILE_WIDTH * currentGridWidth;
      const diamondHeight = TILE_HEIGHT * currentGridHeight;

      const outputWidth = diamondWidth * 2 * 2;
      const outputHeight = (TILE_HEIGHT * currentGridHeight + TILE_HEIGHT * 3) * 2;

      const centerX = outputWidth / 2;
      const baseY = outputHeight - TILE_HEIGHT * 2;

      const dstTop = { x: centerX, y: baseY - diamondHeight };
      const dstRight = { x: centerX + diamondWidth, y: baseY };
      const dstBottom = { x: centerX, y: baseY + diamondHeight };
      const dstLeft = { x: centerX - diamondWidth, y: baseY };

      const warpedBlob = await warpImageWithPerspective(
        image,
        [ordered.top, ordered.right, ordered.bottom, ordered.left],
        [dstTop, dstRight, dstBottom, dstLeft],
        outputWidth,
        outputHeight
      );

      const statusEl = document.getElementById("upload-status");
      if (statusEl) statusEl.textContent = "여백 제거 중...";
      const trimmedBlob = await trimTransparentEdgesWithBase(warpedBlob, baseY + diamondHeight);

      close({ blob: trimmedBlob });
    } catch (error) {
      console.error("calibration error", error);
      close(null);
    }
  });

  function updateHint() {
    if (!hint) return;
    if (points.length < 4) {
      hint.textContent = `${ORDER[points.length]} 꼭짓점을 클릭하세요.`;
      confirmBtn.disabled = true;
    } else {
      hint.textContent = "확인 버튼을 눌러 보정을 완료하세요.";
      confirmBtn.disabled = false;
    }
  }

  function drawOverlay() {
    if (!image) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const scaleX = canvas.width / image.width;
    const scaleY = canvas.height / image.height;
    scale = Math.min(scaleX, scaleY);
    offsetX = (canvas.width - image.width * scale) / 2;
    offsetY = (canvas.height - image.height * scale) / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0);
    ctx.restore();

    if (points.length === 3) {
      const bottom = points[0];
      const left = points[1];
      const right = points[2];

      const centerX = (left.canvasX + right.canvasX) / 2;
      const centerY = (left.canvasY + right.canvasY) / 2;

      const dx = centerX - bottom.canvasX;
      const dy = centerY - bottom.canvasY;

      const topX = centerX + dx;
      const topY = centerY + dy;

      ctx.save();
      ctx.strokeStyle = "rgba(0, 255, 0, 0.7)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);

      ctx.beginPath();
      ctx.moveTo(topX - 20, topY);
      ctx.lineTo(topX + 20, topY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(topX, topY - 20);
      ctx.lineTo(topX, topY + 20);
      ctx.stroke();

      ctx.fillStyle = "rgba(0, 255, 0, 0.7)";
      ctx.beginPath();
      ctx.arc(topX, topY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    ctx.fillStyle = "#ffbd4a";
    ctx.strokeStyle = "#ffbd4a";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    if (points.length) {
      ctx.beginPath();
      points.forEach((p, index) => {
        const x = p.canvasX;
        const y = p.canvasY;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.canvasX, p.canvasY, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function close(result) {
    modal.classList.remove("visible");
    image = null;
    points = [];
    confirmBtn.disabled = true;
    if (resolveFn) {
      resolveFn(result || null);
      resolveFn = null;
    }
  }

  function syncCanvasSize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }

  return {
    async open(file, gridWidth = 1, gridHeight = 1) {
      currentGridWidth = gridWidth;
      currentGridHeight = gridHeight;
      const dataUrl = await blobToDataURL(file);
      image = await loadImageElement(dataUrl);
      points = [];
      syncCanvasSize();
      drawOverlay();
      updateHint();
      modal.classList.add("visible");
      return new Promise((resolve) => {
        resolveFn = resolve;
      });
    }
  };
}

function computePerspectiveTransform(srcPts, dstPts) {
  const matrix = [];
  const vector = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = srcPts[i];
    const { x: X, y: Y } = dstPts[i];

    matrix.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    vector.push(X);

    matrix.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    vector.push(Y);
  }

  const solution = solveLinearSystem(matrix, vector);
  return {
    a: solution[0], b: solution[1], c: solution[2],
    d: solution[3], e: solution[4], f: solution[5],
    g: solution[6], h: solution[7]
  };
}

function solveLinearSystem(matrix, vector) {
  const size = matrix.length;
  const numVars = matrix[0].length;
  const M = matrix.map((row, i) => [...row, vector[i]]);

  for (let col = 0; col < numVars; col++) {
    let pivot = col;
    for (let row = col + 1; row < size; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) {
        pivot = row;
      }
    }
    const temp = M[col];
    M[col] = M[pivot];
    M[pivot] = temp;
    const pivotVal = M[col][col] || 1e-10;
    for (let j = col; j <= numVars; j++) {
      M[col][j] /= pivotVal;
    }
    for (let row = 0; row < size; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      for (let j = col; j <= numVars; j++) {
        M[row][j] -= factor * M[col][j];
      }
    }
  }
  return M.map((row) => row[numVars]);
}

let glCanvas = null;
let glContext = null;
let glProgram = null;
let glBuffers = null;

function initWebGL() {
  if (glCanvas) return true;

  glCanvas = document.createElement("canvas");
  // 초기 크기 설정 (나중에 필요에 따라 조정)
  glCanvas.width = 1024;
  glCanvas.height = 1024;

  glContext = glCanvas.getContext("webgl", { preserveDrawingBuffer: true }) || glCanvas.getContext("experimental-webgl");

  if (!glContext) return false;

  const vsSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
      v_texCoord = a_texCoord;
    }
  `;

  const fsSource = `
    precision mediump float;
    uniform sampler2D u_image;
    uniform mat3 u_matrix;
    varying vec2 v_texCoord;
    
    void main() {
      vec3 pos = u_matrix * vec3(v_texCoord, 1.0);
      if (pos.z == 0.0) {
         gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
         return;
      }
      vec2 texCoord = pos.xy / pos.z;
      
      if (texCoord.x >= 0.0 && texCoord.x <= 1.0 && texCoord.y >= 0.0 && texCoord.y <= 1.0) {
        gl_FragColor = texture2D(u_image, texCoord);
      } else {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      }
    }
  `;

  glProgram = createShaderProgram(glContext, vsSource, fsSource);
  if (!glProgram) return false;

  const positionBuffer = glContext.createBuffer();
  glContext.bindBuffer(glContext.ARRAY_BUFFER, positionBuffer);
  glContext.bufferData(glContext.ARRAY_BUFFER, new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    -1, 1,
    1, -1,
    1, 1,
  ]), glContext.STATIC_DRAW);

  const texCoordBuffer = glContext.createBuffer();

  glBuffers = {
    position: positionBuffer,
    texCoord: texCoordBuffer
  };

  return true;
}

async function warpImageWithPerspective(image, srcPts, dstPts, outputWidth, outputHeight) {
  try {
    if (!initWebGL()) {
      throw new Error("WebGL init failed");
    }

    const gl = glContext;

    // 캔버스 크기 조정 (필요한 경우에만)
    if (glCanvas.width < outputWidth || glCanvas.height < outputHeight) {
      glCanvas.width = Math.max(glCanvas.width, outputWidth);
      glCanvas.height = Math.max(glCanvas.height, outputHeight);
      gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    }

    gl.useProgram(glProgram);

    // Position Buffer 연결
    const positionLocation = gl.getAttribLocation(glProgram, "a_position");
    gl.bindBuffer(gl.ARRAY_BUFFER, glBuffers.position);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // TexCoord Buffer 업데이트 및 연결
    // 캔버스 전체가 아닌 실제 출력 영역(outputWidth, outputHeight)만 사용하도록 UV 매핑
    // 하지만 여기서는 쉐이더에서 픽셀 좌표를 역변환하므로, 
    // 쿼드(Quad)는 전체 화면(-1~1)을 덮고, 
    // 쉐이더에 전달하는 텍스처 좌표(v_texCoord)가 0~outputWidth, 0~outputHeight 범위를 가져야 함.
    // 기존 로직: a_texCoord에 0~outputWidth, 0~outputHeight 값을 넣음.

    gl.bindBuffer(gl.ARRAY_BUFFER, glBuffers.texCoord);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,
      outputWidth, 0,
      0, outputHeight,
      0, outputHeight,
      outputWidth, 0,
      outputWidth, outputHeight,
    ]), gl.DYNAMIC_DRAW); // 매번 바뀌므로 DYNAMIC_DRAW

    const texCoordLocation = gl.getAttribLocation(glProgram, "a_texCoord");
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    // 텍스처 생성 및 업로드 (매번 새로 생성해야 함 - 이미지 변경 시)
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    // 행렬 계산
    const invH = computePerspectiveTransform(dstPts, srcPts);
    const matrix = [
      invH.a / image.width, invH.d / image.height, invH.g,
      invH.b / image.width, invH.e / image.height, invH.h,
      invH.c / image.width, invH.f / image.height, 1
    ];

    const matrixLocation = gl.getUniformLocation(glProgram, "u_matrix");
    gl.uniformMatrix3fv(matrixLocation, false, matrix);

    // 렌더링
    // 뷰포트를 실제 출력 크기로 설정
    gl.viewport(0, 0, outputWidth, outputHeight);

    // 알파 채널 클리어
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // 텍스처 해제 (메모리 누수 방지)
    gl.deleteTexture(texture);

    // 결과 추출
    // 전체 캔버스가 아닌 유효 영역만 추출하기 위해 임시 캔버스 사용 또는 toBlob 시 영역 지정 불가하므로
    // getImageData 후 putImageData로 자르거나, 
    // 가장 효율적인 방법: 현재 캔버스에서 toBlob을 하되, 결과물은 outputWidth/Height 크기여야 함.
    // 하지만 glCanvas는 더 클 수 있음.
    // 해결책: 캔버스 크기를 딱 맞추거나, 픽셀 데이터를 읽어서 새 캔버스에 그림.

    // 성능을 위해 캔버스 크기를 딱 맞추는 것이 좋지만, 잦은 리사이징은 좋지 않음.
    // 여기서는 정확성을 위해 픽셀을 읽어오는 방식을 사용 (readPixels)

    const pixels = new Uint8Array(outputWidth * outputHeight * 4);
    gl.readPixels(0, 0, outputWidth, outputHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // WebGL은 Y축이 반대이므로 뒤집어줘야 할 수도 있음. 
    // 하지만 기본 설정상 텍스처 좌표와 매핑이 맞으면 괜찮음. 
    // 보통 readPixels는 좌하단 기준. toBlob은 좌상단 기준.
    // 여기서는 간단히 캔버스 리사이징 방식을 사용해보고, 문제되면 readPixels로 변경.
    // 캔버스 리사이징은 컨텍스트 손실을 유발할 수 있으므로 주의.

    // 안전하게: 결과 전용 2D 캔버스에 그리기
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = outputWidth;
    resultCanvas.height = outputHeight;
    const ctx = resultCanvas.getContext('2d');

    // drawImage로 WebGL 캔버스의 일부분만 가져오기
    // WebGL 캔버스의 Y축이 뒤집혀 나올 수 있으므로 확인 필요.
    // 일반적인 경우 drawImage(glCanvas, ...)는 잘 동작함.

    ctx.drawImage(glCanvas, 0, 0, outputWidth, outputHeight, 0, 0, outputWidth, outputHeight);

    return await new Promise((resolve) => {
      resultCanvas.toBlob(resolve, "image/png");
    });

  } catch (e) {
    console.warn("WebGL error, falling back to CPU:", e);
    return warpImageWithPerspectiveCPU(image, srcPts, dstPts, outputWidth, outputHeight);
  }
}

function createShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

function loadShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

async function warpImageWithPerspectiveCPU(image, srcPts, dstPts, outputWidth, outputHeight) {
  const H = computePerspectiveTransform(srcPts, dstPts);
  const invH = computePerspectiveTransform(dstPts, srcPts);

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = image.width;
  srcCanvas.height = image.height;
  const srcCtx = srcCanvas.getContext("2d");
  srcCtx.drawImage(image, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, image.width, image.height);
  const srcPixels = srcData.data;

  const dstData = ctx.createImageData(outputWidth, outputHeight);
  const dstPixels = dstData.data;

  for (let dstY = 0; dstY < outputHeight; dstY++) {
    for (let dstX = 0; dstX < outputWidth; dstX++) {
      const src = applyPerspectiveTransform(invH, dstX, dstY);
      const srcX = Math.round(src.x);
      const srcY = Math.round(src.y);

      if (srcX >= 0 && srcX < image.width && srcY >= 0 && srcY < image.height) {
        const srcIdx = (srcY * image.width + srcX) * 4;
        const dstIdx = (dstY * outputWidth + dstX) * 4;
        dstPixels[dstIdx] = srcPixels[srcIdx];
        dstPixels[dstIdx + 1] = srcPixels[srcIdx + 1];
        dstPixels[dstIdx + 2] = srcPixels[srcIdx + 2];
        dstPixels[dstIdx + 3] = srcPixels[srcIdx + 3];
      }
    }
  }

  ctx.putImageData(dstData, 0, 0);

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("perspective warp failed"));
    }, "image/png");
  });
}

function applyPerspectiveTransform(H, x, y) {
  const w = H.g * x + H.h * y + 1;
  return {
    x: (H.a * x + H.b * y + H.c) / w,
    y: (H.d * x + H.e * y + H.f) / w,
  };
}

async function trimTransparentEdgesWithBase(blob, baseY) {
  const img = await loadImageElement(await blobToDataURL(blob));
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const alpha = pixels[(y * canvas.width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (minX > maxX || minY > maxY) {
    return blob;
  }

  const cropX = minX;
  const cropY = minY;
  const cropWidth = maxX - minX + 1;
  const cropHeight = Math.ceil(baseY) - minY + 1;

  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = cropWidth;
  croppedCanvas.height = cropHeight;
  const croppedCtx = croppedCanvas.getContext("2d");
  croppedCtx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  return await new Promise((resolve, reject) => {
    croppedCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("trim failed"));
    }, "image/png");
  });
}

export function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
