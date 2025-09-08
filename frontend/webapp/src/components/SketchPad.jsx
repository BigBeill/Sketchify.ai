import React, { useRef, useState, useEffect } from "react";
import { CallApi } from "../../api/api";
import { useAuth } from "@/context/authContext";
import { storage, db } from "@/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  doc,
  addDoc,
  collection,
  serverTimestamp,
  arrayUnion,
  updateDoc,
} from "firebase/firestore";
import Pencil from "../../public/pencilTool.png";
import Line from "../../public/lineTool.png";
import Square from "../../public/squareTool.png";
import Triangle from "../../public/triangleTool.png";
import Circle from "../../public/circleTool.png";
import Bucket from "../../public/bucketTool.png";
import Eraser from "../../public/eraserTool.png";

const DropdownMenu = ({
  id,
  label,
  options,
  openDropdown,
  setOpenDropdown,
  onThemeChange,
}) => {
  const [selected, setSelected] = useState("");
  const isOpen = openDropdown === id;

  const handleToggle = () => {
    setOpenDropdown(isOpen ? null : id);
  };

  return (
    <div className="relative w-full md:w-[300px]">
      <button
        className="w-full bg-primary text-white px-4 py-2 rounded-lg flex items-center font-fraunces text-center justify-center"
        onClick={handleToggle}
      >
        {selected || label}
        <span className="ml-2">▼</span>
      </button>
      {isOpen && (
        <ul className="absolute left-0 mt-1 w-full border border-gray-300 rounded-lg shadow-lg z-50 font-fraunces bg-primary text-white text-center">
          {options.map((option, index) => (
            <li
              key={index}
              className="px-4 py-2 hover:bg-gray-200 cursor-pointer hover:text-black text-lg"
              onClick={() => {
                setSelected(option);
                setOpenDropdown(null);
                if (onThemeChange) {
                  onThemeChange(option);
                }
              }}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const SketchPad = () => {
  
  const [isLoading, setIsLoading] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [activeTool, setActiveTool] = useState(null);
  const [lineStart, setLineStart] = useState(null);
  const [lineWidth, setLineWidth] = useState(2);
  const [undoStack, setUndoStack] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState("#000000");
  const [ThemeData, Setheme] = useState("Default");
  const [additonalPrompt, setAdditonalPrompt] = useState(" ");
  const [complexity, setComplexity] = useState("Standard");

  // Refs
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);

  // Auth context
  const { currentUser } = useAuth();

  const updateCanvasSize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const containerWidth = canvas.parentElement.clientWidth;
    const aspectRatio = 700 / 1080;
    const newWidth = containerWidth;
    const newHeight = newWidth * aspectRatio;

    canvas.width = newWidth;
    canvas.height = newHeight;

    const ctx = canvas.getContext("2d");
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.strokeStyle = currentColor;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const aspectRatio = 700 / 1080;
    canvas.width = 1080;
    canvas.height = 700;
    canvas.style.width = "100%";

    updateCanvasSize();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.strokeStyle = currentColor;
    ctx.fillStyle = "#FFFFFF";

    ctxRef.current = ctx;

    window.addEventListener("resize", updateCanvasSize);
    return () => window.removeEventListener("resize", updateCanvasSize);
  }, []);

  useEffect(() => {
    if (!ctxRef.current) return;
    ctxRef.current.lineWidth = lineWidth;
    ctxRef.current.strokeStyle =
      activeTool === "eraser" ? "#FFFFFF" : currentColor;
  }, [lineWidth, currentColor, activeTool]);

  // Add this useEffect for keyboard shortcuts after your other useEffects
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'e' || e.key === 'E') {
        toggleTool('eraser');
      } else if (e.key === 'p' || e.key === 'P') {
        toggleTool('freehand');
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const getMousePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvasRef.current.width,
      y: ((e.clientY - rect.top) / rect.height) * canvasRef.current.height,
    };
  };

  const saveState = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setUndoStack((prev) => [...prev, imageData]);
  };
  
  const clearCanvas = () => {
    const ctx = ctxRef.current;
    // First clear the canvas
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    // Then fill with white background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    

    const currentState = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    setUndoStack(prev => [...prev, currentState]);
  };
  
   const undo = () => {
    if (undoStack.length > 0) {
      const ctx = ctxRef.current;
      const lastState = undoStack[undoStack.length - 1];
      ctx.putImageData(lastState, 0, 0);
      setUndoStack((prev) => prev.slice(0, -1));
    }
  };


  const hexToRgb = (hex) => {
    const bigint = parseInt(hex.slice(1), 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  };

  const floodFill = (startX, startY, fillColor) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const stack = [];
    const pixelPos = (x, y) => (y * canvas.width + x) * 4;

    const x0 = Math.floor(startX);
    const y0 = Math.floor(startY);
    if (x0 < 0 || y0 < 0 || x0 >= canvas.width || y0 >= canvas.height) return;

    const startIdx = pixelPos(x0, y0);
    const startColor = [
      data[startIdx],
      data[startIdx + 1],
      data[startIdx + 2],
      data[startIdx + 3],
    ];

    const matchColor = (idx) =>
      data[idx] === startColor[0] &&
      data[idx + 1] === startColor[1] &&
      data[idx + 2] === startColor[2] &&
      data[idx + 3] === startColor[3];

    const setPixel = (idx) => {
      data[idx] = fillColor[0];
      data[idx + 1] = fillColor[1];
      data[idx + 2] = fillColor[2];
      data[idx + 3] = 255;
    };

    stack.push([x0, y0]);

    while (stack.length > 0) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
      const idx = pixelPos(x, y);
      if (!matchColor(idx)) continue;
      setPixel(idx);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    ctx.putImageData(imageData, 0, 0);
  };

  const startDrawing = (e) => {
    saveState();
    const pos = getMousePos(e);
    const ctx = ctxRef.current;
    if (!ctx) return;

    if (["line", "square", "triangle", "circle"].includes(activeTool)) {
      setLineStart(pos);
    } else if (activeTool === "freehand" || activeTool === "eraser") {
      ctx.globalCompositeOperation =
        activeTool === "eraser" ? "destination-out" : "source-over";
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      setIsDrawing(true);
    } else if (activeTool === "bucket") {
      ctx.globalCompositeOperation = "source-over";
      const fillColor = hexToRgb(currentColor);
      floodFill(pos.x, pos.y, fillColor);
    }
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const pos = getMousePos(e);
    ctxRef.current.lineTo(pos.x, pos.y);
    ctxRef.current.stroke();
  };

  const stopDrawing = (e) => {
    const pos = getMousePos(e);
    const ctx = ctxRef.current;
    ctx.globalCompositeOperation = "source-over";

    if (
      lineStart &&
      ["line", "square", "triangle", "circle"].includes(activeTool)
    ) {
      if (activeTool === "line") {
        ctx.beginPath();
        ctx.moveTo(lineStart.x, lineStart.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      } else if (activeTool === "square") {
        const x = Math.min(lineStart.x, pos.x);
        const y = Math.min(lineStart.y, pos.y);
        const width = Math.abs(pos.x - lineStart.x);
        const height = Math.abs(pos.y - lineStart.y);
        ctx.strokeRect(x, y, width, height);
      } else if (activeTool === "triangle") {
        const x1 = lineStart.x;
        const y1 = lineStart.y;
        const x2 = pos.x;
        const y2 = pos.y;

        const topX = (x1 + x2) / 2;
        const topY = Math.min(y1, y2);
        const baseY = Math.max(y1, y2);

        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.lineTo(x1, baseY);
        ctx.lineTo(x2, baseY);
        ctx.closePath();
        ctx.stroke();
      } else if (activeTool === "circle") {
        const dx = pos.x - lineStart.x;
        const dy = pos.y - lineStart.y;
        const radius = Math.sqrt(dx * dx + dy * dy) / 2;
        const centerX = (lineStart.x + pos.x) / 2;
        const centerY = (lineStart.y + pos.y) / 2;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.stroke();
      }
      setLineStart(null);
    }

    if (isDrawing) {
      ctx.closePath();
      setIsDrawing(false);
    }
  };

  const toggleTool = (toolName) => {
    setActiveTool(activeTool === toolName ? null : toolName);
  };

  const getCanvasImage = () => canvasRef.current.toDataURL("image/png");

  // converts base64 string to Blob for firebase storage
  const base64ToBlob = (base64) => {
    const byteString = atob(base64.split(",")[1]);
    const mimeString = base64.split(",")[0].split(":")[1].split(";")[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i<byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  };

  const handleComplexityChange = (complexity) => {
	
	setComplexity(complexity);
	console.log(complexity);
  }
  const handleThemeChange = (theme) => {
    // Function to handle theme change
    Setheme(theme);

    console.log(ThemeData);
  };

  // Main function to handle API call and image upload to firebase
  // This function is called when the "Enhance" button is clicked
  const HandleAPICall = async () => {
    setIsLoading(true);

    const canvasImageDataURL = getCanvasImage();
    const originalBlob = base64ToBlob(canvasImageDataURL);
    const userId = currentUser.uid; // Get the user ID from the current use

   
    const originalRef = ref(
      storage,
      `users/${userId}/profile/sketch_original_${Date.now()}.png`
    );
    await uploadBytes(originalRef, originalBlob);
    const originalURL = await getDownloadURL(originalRef);

    console.log("Original image uploaded:", originalURL);

    
    const response = await CallApi(
      canvasImageDataURL,
      ThemeData,
      additonalPrompt,
	  complexity
    );

    if (!response) {
      setIsLoading(false);
	  console.log('There was an Error with the API call')
      return; 
    }
	  const title = response.data.title;
    const enhancedBase64 = `data:image/png;base64,${response.data.image}`;
    const enhancedBlob = base64ToBlob(enhancedBase64);
    const enhancedRef = ref(
      storage,
      `users/${userId}/profile/sketch_enhanced_${Date.now()}.png`
    );
    await uploadBytes(enhancedRef, enhancedBlob);
    const enhancedURL = await getDownloadURL(enhancedRef);

    console.log("Enhanced image uploaded:", enhancedURL);

    const img = new Image();
    img.src = enhancedBase64;
    img.onload = () => {
      const canvas = canvasRef.current;
      ctxRef.current.clearRect(0, 0, canvas.width, canvas.height);
      ctxRef.current.drawImage(img, 0, 0, canvas.width, canvas.height);
      setIsLoading(false);
    };
    img.onerror = () => setIsLoading(false);
	
    try {
      const user = currentUser;

      const postDoc = await addDoc(collection(db, "users", user.uid, "posts"), {
        title:
          title || `${user.name} ${ThemeData.toLowerCase()} sketch`,
        drawing: originalURL,
        image: enhancedURL,
        createdAt: serverTimestamp(),
        theme: ThemeData.toLowerCase(),
      });

      // Update the same doc with its own ID
      await updateDoc(postDoc, {
        id: postDoc.id,
      });

      // ---- dont think we want this but we can add it later, adds a myPosts array to the user
      // // Update user with post reference
      // const userRef = doc(db, "users", user.uid);
      // await updateDoc(userRef, {
      // 	myPosts: arrayUnion(postDoc.id),
      // });

      console.log("Post saved to Firestore with ID:", postDoc.id);
    } catch (err) {
      console.error("Error saving to Firestore:", err);
    }
  };

  useEffect(() => {
    console.log("Prompt", additonalPrompt);
  }, [additonalPrompt]);

  return (
    <div className="text-gray-900 flex flex-col md:flex-row items-center py-8 justify-center px-4">
      <div className="mt-6 flex flex-col md:flex-row md:gap-6 w-full">
        <div className="flex flex-col bg-primary text-white p-4 rounded-lg w-full md:w-auto">
          <div className="grid grid-cols-2 gap-4">
            {/* Color and Line Width Controls */}
            <div className="col-span-2 flex-col justify-between items-center mb-4 w-full">
              <div className="flex items-center">
                <input
                  type="color"
                  value={currentColor}
                  onChange={(e) => setCurrentColor(e.target.value)}
                  className="w-6 h-6 cursor-pointer"
                />
                <span className="text-white ml-2 font-fraunces">Color</span>
              </div>
              <div className="flex items-center">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={lineWidth}
                  onChange={(e) => setLineWidth(e.target.value)}
                  className="w-24"
				  
                />
                <span className="text-white ml-2">{lineWidth}</span>
              </div>
            </div>

            {/* Tool Buttons in 2x4 Grid */}
            <button
              className={`text-white p-4 rounded-lg font-fraunces ${
                activeTool === "freehand" ? "bg-secondary" : "bg-primary hover:bg-secondary"
              }`}
              onClick={() => toggleTool("freehand")}
            >
              <img
                src={Pencil.src}
                style={{
                  width: "60px",
                  height: "auto",
                  filter: "brightness(0) invert(1)"
                }}
                alt="Freehand"
                className="mx-auto block"
              />
            </button>
            <button
              className={`text-white p-2 rounded-lg font-fraunces ${
                activeTool === "line" ? "bg-secondary" : "bg-primary hover:bg-secondary"
              }`}
              onClick={() => toggleTool("line")}
            >
              <img
                src={Line.src}
                style={{
                  width: "60px",
                  height: "auto",
                  filter: "brightness(0) invert(1)"
                }}
                alt="Line"
                className="mx-auto block"
              />
            </button>
            <button
              className={`text-white p-2 rounded-lg font-fraunces ${
                activeTool === "square" ? "bg-secondary" : "bg-primary hover:bg-secondary"
              }`}
              onClick={() => toggleTool("square")}
            >
              <img
                src={Square.src}
                style={{
                  width: "60px",
                  height: "auto",
                  filter: "brightness(0) invert(1)"
                }}
                alt="Square"
                className="mx-auto block"
              />
            </button>
            <button
              className={`text-white p-2 rounded-lg font-fraunces ${
                activeTool === "triangle" ? "bg-secondary" : "bg-primary hover:bg-secondary"
              }`}
              onClick={() => toggleTool("triangle")}
            >
              <img
                src={Triangle.src}
                style={{
                  width: "60px",
                  height: "auto",
                  filter: "brightness(0) invert(1)"
                }}
                alt="Triangle"
                className="mx-auto block"
              />
            </button>
            <button
              className={`text-white p-2 rounded-lg font-fraunces ${
                activeTool === "circle" ? "bg-secondary" : "bg-primary hover:bg-secondary"
              }`}
              onClick={() => toggleTool("circle")}
            >
              <img
                src={Circle.src}
                style={{
                  width: "60px",
                  height: "auto",
                  filter: "brightness(0) invert(1)"
                }}
                alt="Circle"
                className="mx-auto block"
              />
            </button>
            <button
              className={`text-white p-2 rounded-lg font-fraunces ${
                activeTool === "bucket" ? "bg-secondary" : "bg-primary hover:bg-secondary"
              }`}
              onClick={() => toggleTool("bucket")}
            >
              <img
                src={Bucket.src}
                style={{
                  width: "60px",
                  height: "auto",
                  filter: "brightness(0) invert(1)"
                }}
                alt="Bucket"
                className="mx-auto block"
              />
            </button>
            <button
              className={`text-white p-2 rounded-lg font-fraunces ${
                activeTool === "eraser" ? "bg-secondary" : "bg-primary hover:bg-secondary"
              }`}
              onClick={() => toggleTool("eraser")}
            >
              <img
                src={Eraser.src}
                style={{
                  width: "60px",
                  height: "auto",
                  filter: "brightness(0) invert(1)"
                }}
                alt="Eraser"
                className="mx-auto block"
              />
            </button>
          </div>
        </div>

        <div className="flex-1 border rounded-lg bg-white shadow-md relative w-full min-h-[500px]">
          <canvas
            ref={canvasRef}

            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}

            className="rounded-lg border-black border-solid touch-none"
            style={{
              cursor: activeTool === 'eraser' 
                ? `url(${Eraser.src}) 0 20, auto`
                : activeTool === 'freehand'
                ? `url(${Pencil.src}) 0 20, auto`
                : activeTool === 'bucket'
                ? `url(${Bucket.src}) 0 20, auto`
                : activeTool === 'line'
                ? `url(${Line.src}) 0 20, auto`
                : activeTool === 'square'
                ? `url(${Square.src}) 0 20, auto`
                : activeTool === 'triangle'
                ? `url(${Triangle.src}) 0 20, auto`
                : activeTool === 'circle'
                ? `url(${Circle.src}) 0 20, auto`
                : 'default',
			width: '100%',
			height: '100%'
            }}
          ></canvas>

          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-50 z-10">
              <div className="w-12 h-12 border-4 border-t-4 border-gray-200 rounded-full animate-spin mb-4"></div>
              <span className="text-white text-6xl font-fraunces">
                Enhancing....
              </span>
            </div>
          )}

          <div className="absolute bottom-2 right-2 flex gap-2">
            <button
              className="bg-gray-800 text-white p-2 rounded-md"
              onClick={
                clearCanvas
              }
            >
              Clear 🔲
            </button>
            <button
              className="bg-gray-800 text-white p-2 rounded-md"
              onClick={undo}
            >
              Undo ↩️
            </button>
          </div>
        </div>

        <div className="flex flex-col space-y-6 w-full md:w-auto">
          <textarea
            className="border border-black placeholder-gray-500 px-3 py-2 rounded-lg bg-background w-full md:w-[300px] h-[250px] resize-none"
            placeholder="Additional Notes..."
            onChange={(e) => setAdditonalPrompt(e.target.value)}
          ></textarea>

          <DropdownMenu
            id="theme"
            label="Theme"
            options={["Realism", "Minimalism", "Abstract", "Cartoon", "Anime"]}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            onThemeChange={handleThemeChange}
          />
          <DropdownMenu
            id="Quality"
            label="Image Complexity"
            options={["HD","Standard"]}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
			onThemeChange={handleComplexityChange}
          />
        

          <div className="pt-8">
            <button
              className={`w-full md:w-[300px] bg-secondary text-white px-4 py-2 rounded-lg font-fraunces ${
                isLoading ? "opacity-50" : "opacity-100"
              }`}
              onClick={HandleAPICall}
              disabled={isLoading}
            >
              {isLoading ? "Enhancing..." : "Enhance"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SketchPad;
