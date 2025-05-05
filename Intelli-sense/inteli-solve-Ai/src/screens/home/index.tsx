import { ColorSwatch, Group, Slider } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import Draggable from 'react-draggable';
import { SWATCHES } from '@/constants';

interface GeneratedResult {
  expression: string;
  answer: string;
}

interface Response {
  expr: string;
  result: string;
  assign: boolean;
}

interface Point {
  x: number;
  y: number;
}

interface LatexBox {
  latex: string;
  position: Point;
}

interface TextBox {
  text: string;
  position: Point;
}

type Tool = 'pen' | 'line' | 'rectangle' | 'circle' | 'eraser' | 'text';

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('white');
  const [brushSize, setBrushSize] = useState(3);
  const [reset, setReset] = useState(false);
  const [dictOfVars, setDictOfVars] = useState({});
  const [result, setResult] = useState<GeneratedResult>();
  const [latexBoxes, setLatexBoxes] = useState<LatexBox[]>([]);
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
  const [tool, setTool] = useState<Tool>('pen');
  const [startPos, setStartPos] = useState<Point | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  const renderLatexToCanvas = useCallback((expression: string, answer: string) => {
    const latex = `\\(\\LARGE{${expression} = ${answer}}\\)`;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (imageData.data[i + 3] > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    const position = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    setLatexBoxes(prev => [...prev, { latex, position }]);
  }, []);

  useEffect(() => {
    if (latexBoxes.length > 0 && window.MathJax) {
      setTimeout(() => {
        window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub]);
      }, 0);
    }
  }, [latexBoxes]);

  useEffect(() => {
    if (result) {
      renderLatexToCanvas(result.expression, result.answer);
    }
  }, [result, renderLatexToCanvas]);

  useEffect(() => {
    if (reset) {
      resetCanvas();
      setLatexBoxes([]);
      setTextBoxes([]);
      setResult(undefined);
      setDictOfVars({});
      setReset(false);
      setHistory([]);
      setRedoStack([]);
    }
  }, [reset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (canvas && previewCanvas) {
      const width = window.innerWidth;
      const height = window.innerHeight - canvas.offsetTop;
      canvas.width = width;
      canvas.height = height;
      previewCanvas.width = width;
      previewCanvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx!.lineCap = 'round';
      ctx!.lineWidth = brushSize;
      ctx!.fillStyle = 'black';
      ctx!.fillRect(0, 0, canvas.width, canvas.height);
      saveHistory();
    }
  }, []);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.9/MathJax.js?config=TeX-MML-AM_CHTML';
    script.async = true;
    document.head.appendChild(script);
    script.onload = () => {
      window.MathJax.Hub.Config({
        tex2jax: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
      });
    };
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  const saveHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHistory(prev => [...prev, canvas.toDataURL()]);
    setRedoStack([]);
  };

  const resetCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      ctx!.fillStyle = 'black';
      ctx!.fillRect(0, 0, canvas.width, canvas.height);
    }
  };

  const undo = () => {
    if (history.length < 2) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const last = history[history.length - 2];
    setRedoStack(prev => [...prev, history[history.length - 1]]);
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = last;
    setHistory(prev => prev.slice(0, -1));
    setTextBoxes(prev => prev.slice(0, -1));
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const last = redoStack[redoStack.length - 1];
    setHistory(prev => [...prev, last]);
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = last;
    setRedoStack(prev => prev.slice(0, -1));
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = tool === 'eraser' ? 'black' : color;
    setIsDrawing(true);
    setStartPos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
    if (tool === 'pen' || tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    }
    saveHistory();
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current || !previewCanvasRef.current || !startPos) return;

    const ctx = canvasRef.current.getContext('2d');
    const previewCtx = previewCanvasRef.current.getContext('2d');
    if (!ctx || !previewCtx) return;

    const endX = e.nativeEvent.offsetX;
    const endY = e.nativeEvent.offsetY;

    previewCtx.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
    previewCtx.strokeStyle = tool === 'eraser' ? 'black' : color;
    previewCtx.lineWidth = brushSize;

    if (tool === 'pen' || tool === 'eraser') {
      ctx.lineTo(endX, endY);
      ctx.stroke();
    } else if (tool === 'line') {
      previewCtx.beginPath();
      previewCtx.moveTo(startPos.x, startPos.y);
      previewCtx.lineTo(endX, endY);
      previewCtx.stroke();
    } else if (tool === 'rectangle') {
      previewCtx.strokeRect(startPos.x, startPos.y, endX - startPos.x, endY - startPos.y);
    } else if (tool === 'circle') {
      const radius = Math.sqrt((endX - startPos.x) ** 2 + (endY - startPos.y) ** 2);
      previewCtx.beginPath();
      previewCtx.arc(startPos.x, startPos.y, radius, 0, 2 * Math.PI);
      previewCtx.stroke();
    }
  };

  const stopDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (previewCanvasRef.current) {
      const ctx = previewCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
    }

    if (!isDrawing || !canvasRef.current || !startPos) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const { x, y } = startPos;
    const endX = e.nativeEvent.offsetX;
    const endY = e.nativeEvent.offsetY;

    if (tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
    if (tool === 'rectangle') {
      ctx.strokeRect(x, y, endX - x, endY - y);
    }
    if (tool === 'circle') {
      ctx.beginPath();
      const radius = Math.sqrt((endX - x) ** 2 + (endY - y) ** 2);
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.stroke();
    }
    if (tool === 'text') {
      const text = prompt('Enter text:');
      if (text) setTextBoxes(prev => [...prev, { text, position: { x: endX, y: endY } }]);
    }

    setIsDrawing(false);
    setStartPos(null);
    saveHistory();
  };

  const runRoute = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const response = await axios.post(`${import.meta.env.VITE_API_URL}/calculate`, {
      image: canvas.toDataURL('image/png'),
      dict_of_vars: dictOfVars
    });
    const resp = await response.data;
    resp.data.forEach((data: Response) => {
      setTimeout(() => {
        setResult({ expression: data.expr, answer: data.result });
      }, 1000);
    });
  };

  return (
    <>
      <div className='grid grid-cols-6 gap-2 p-2'>
        <div className='col-span-6 flex flex-wrap gap-2'>
          <Button onClick={() => setReset(true)} className='z-20 bg-black text-white'>Reset</Button>
          <Button onClick={undo} className='z-20 bg-black text-white'>Undo</Button>
          <Button onClick={redo} className='z-20 bg-black text-white'>Redo</Button>
          <Button onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const link = document.createElement('a');
            link.download = 'drawing.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
          }} className='z-20 bg-black text-white'>Save Image</Button>

          <div className="flex gap-1 z-20">
            {(['pen', 'line', 'rectangle', 'circle', 'eraser', 'text'] as Tool[]).map((t) => (
              <Button
                key={t}
                onClick={() => setTool(t)}
                className={`z-20 ${tool === t ? 'bg-white text-black' : 'bg-black text-white'}`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Button>
            ))}
          </div>

          <Slider
            className='z-20 w-40'
            label="Brush Size"
            value={brushSize}
            onChange={setBrushSize}
            min={1}
            max={50}
          />

          <Group className='z-20'>
            {SWATCHES.map((swatch) => (
              <ColorSwatch
                key={swatch}
                color={swatch}
                onClick={() => setColor(swatch)}
                style={{ border: color === swatch ? '2px solid white' : 'none', cursor: 'pointer' }}
              />
            ))}
          </Group>

          <Button onClick={runRoute} className='z-20 bg-black text-white'>Run</Button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        id='canvas'
        className='absolute top-0 left-0 w-full h-full'
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing}
      />
      <canvas
        ref={previewCanvasRef}
        className='absolute top-0 left-0 w-full h-full pointer-events-none z-10'
      />

      {latexBoxes.map((box, index) => (
        <Draggable key={index} defaultPosition={box.position}>
          <div className="absolute" style={{ color: 'white', fontSize: '1.5rem' }} dangerouslySetInnerHTML={{ __html: box.latex }} />
        </Draggable>
      ))}

      {textBoxes.map((box, index) => (
        <Draggable key={`text-${index}`} defaultPosition={box.position}>
          <div className="absolute text-white" style={{ fontSize: '1.2rem' }}>{box.text}</div>
        </Draggable>
      ))}
    </>
  );
}
