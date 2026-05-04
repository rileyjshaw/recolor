import { useState, useRef, useEffect } from 'react';
import { HslColorPicker } from 'react-colorful';
import ShaderPad from 'shaderpad';
import save from 'shaderpad/plugins/save';
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { move } from '@dnd-kit/helpers';
import './App.css';

const MAX_COLORS = 32;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp usampler2D;

in vec2 v_uv;
uniform sampler2D u_texture;
uniform usampler2D u_indexMap;
uniform vec3 u_newColors[32];
uniform int u_numColors;

out vec4 outColor;

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  uint idx = texelFetch(u_indexMap, coord, 0).r;
  vec4 texel = texelFetch(u_texture, coord, 0);
  outColor = (idx < uint(u_numColors))
    ? vec4(u_newColors[idx], texel.a)
    : texel;
}
`;

function hexToHsl(hex) {
	const n = parseInt(hex.slice(1), 16);
	const r = (n >> 16) / 255;
	const g = ((n >> 8) & 0xff) / 255;
	const b = (n & 0xff) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s = 0;
	const l = (max + min) / 2;
	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r:
				h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
				break;
			case g:
				h = ((b - r) / d + 2) / 6;
				break;
			default:
				h = ((r - g) / d + 4) / 6;
		}
	}
	return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
	s /= 100;
	l /= 100;
	const a = s * Math.min(l, 1 - l);
	const f = n => {
		const k = (n + h / 30) % 12;
		return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
	};
	return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function hslToHex(h, s, l) {
	const [r, g, b] = hslToRgb(h, s, l);
	return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function parseHex(value) {
	const s = String(value).trim().replace(/^#/, '');
	if (/^[0-9a-fA-F]{6}$/.test(s)) {
		return '#' + s.toLowerCase();
	}
	return null;
}

function getUniqueHexColors(data) {
	const set = new Set();
	for (let i = 0; i < data.data.length; i += 4) {
		const r = data.data[i];
		const g = data.data[i + 1];
		const b = data.data[i + 2];
		const a = data.data[i + 3];
		if (a < 128) continue;
		const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
		set.add(hex);
	}
	return [...set];
}

function buildNewColorsArray(colorMap, paletteHexOrder) {
	const arr = [];
	for (let i = 0; i < 32; i++) {
		if (i < paletteHexOrder.length) {
			const hex = paletteHexOrder[i];
			const hsl = colorMap.get(hex);
			const [r, g, b] = hslToRgb(hsl.h, hsl.s, hsl.l);
			arr.push([r / 255, g / 255, b / 255]);
		} else {
			arr.push([0, 0, 0]);
		}
	}
	return arr;
}

const PICKER_WIDTH = 200;
const PICKER_HEIGHT = 252;

function useLayout(numColors) {
	const [layout, setLayout] = useState('row');
	useEffect(() => {
		function compute() {
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			const pad = 16 * 2 + 16;
			const sidebarThickness = numColors > 0 ? PICKER_WIDTH + 16 : 0;
			const rowArea = (vw - pad - sidebarThickness) * (vh - pad);
			const colArea = (vw - pad) * (vh - pad - (numColors > 0 ? PICKER_HEIGHT + 48 : 0));
			setLayout(rowArea >= colArea ? 'row' : 'column');
		}
		compute();
		window.addEventListener('resize', compute);
		return () => window.removeEventListener('resize', compute);
	}, [numColors]);
	return layout;
}

function SortablePickerWrap({ hex, index, layout, hsl, updateColor }) {
	const currentHex = hslToHex(hsl.h, hsl.s, hsl.l);
	const currentDigits = currentHex.slice(1);
	const [inputValue, setInputValue] = useState(currentDigits);

	useEffect(() => {
		setInputValue(currentDigits);
	}, [currentDigits]);

	const { ref, handleRef, isDragging } = useSortable({ id: hex, index });

	function handleHexChange(e) {
		const raw = e.target.value;
		const sanitized = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
		setInputValue(sanitized);
		const parsed = parseHex(sanitized);
		if (parsed) {
			updateColor(hex, hexToHsl(parsed));
		}
	}

	function handleHexBlur() {
		setInputValue(currentDigits);
	}

	return (
		<div ref={ref} className={`sortable-picker-wrap layout-${layout}`} data-dragging={isDragging}>
			<div className="picker-wrap">
				<div className="picker-header">
					<div className="hex-input-wrap">
						<span className="hex-prefix">#</span>
						<input
							type="text"
							className="hex-input"
							value={inputValue}
							onChange={handleHexChange}
							onBlur={handleHexBlur}
							placeholder="000000"
						/>
					</div>
					<button
						type="button"
						className="reset-btn"
						onClick={() => updateColor(hex, hexToHsl(hex))}
						title="Reset to original color"
					>
						Reset
					</button>
				</div>
				<HslColorPicker color={hsl} onChange={newHsl => updateColor(hex, newHsl)} className="picker" />
			</div>
			<div ref={handleRef} className="drag-handle" title="Drag to reorder" aria-label="Drag to reorder">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
					<circle cx="9" cy="7" r="2" />
					<circle cx="15" cy="7" r="2" />
					<circle cx="9" cy="12" r="2" />
					<circle cx="15" cy="12" r="2" />
					<circle cx="9" cy="17" r="2" />
					<circle cx="15" cy="17" r="2" />
				</svg>
			</div>
		</div>
	);
}

function App() {
	const [colorMap, setColorMap] = useState(null);
	const [paletteHexOrder, setPaletteHexOrder] = useState(null);
	const containerRef = useRef(null);
	const shaderRef = useRef(null);
	const imgRef = useRef(null);
	const indexMapRef = useRef(null);
	const processImageRef = useRef(null);
	const layout = useLayout(paletteHexOrder?.length ?? 0);

	function processImage(img) {
		const w = img.naturalWidth;
		const h = img.naturalHeight;
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		ctx.drawImage(img, 0, 0);
		const data = ctx.getImageData(0, 0, w, h);
		const unique = getUniqueHexColors(data);
		if (unique.length > MAX_COLORS) {
			alert(`Image has ${unique.length} unique colors. Maximum is ${MAX_COLORS}.`);
			return;
		}
		const map = new Map(unique.map(hex => [hex, hexToHsl(hex)]));
		const colorIndexMap = new Map();
		unique.forEach((hex, i) => {
			const n = parseInt(hex.slice(1), 16);
			colorIndexMap.set(n, i);
		});
		const src = data.data;
		const indexMap = new Uint8Array(w * h);
		for (let row = 0; row < h; row++) {
			const srcOffset = row * w * 4;
			const dstOffset = (h - 1 - row) * w;
			for (let col = 0; col < w; col++) {
				const i = srcOffset + col * 4;
				const key = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
				indexMap[dstOffset + col] = colorIndexMap.get(key) ?? 255;
			}
		}
		imgRef.current = img;
		indexMapRef.current = indexMap;
		setColorMap(map);
		setPaletteHexOrder(unique);
	}

	useEffect(() => {
		if (!colorMap || !paletteHexOrder || !containerRef.current) return;
		const img = imgRef.current;
		const indexMap = indexMapRef.current;
		const w = img.naturalWidth;
		const h = img.naturalHeight;
		if (!img || !indexMap) return;

		if (shaderRef.current) {
			shaderRef.current.destroy();
			shaderRef.current = null;
			if (containerRef.current) containerRef.current.innerHTML = '';
		}

		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		canvas.className = 'canvas';
		const shader = new ShaderPad(FRAGMENT_SHADER, {
			canvas,
			plugins: [save()],
		});
		shaderRef.current = shader;

		shader.initializeTexture('u_texture', img, {
			minFilter: 'NEAREST',
			magFilter: 'NEAREST',
		});
		shader.initializeTexture(
			'u_indexMap',
			{ data: indexMap, width: w, height: h },
			{
				internalFormat: 'R8UI',
				format: 'RED_INTEGER',
				type: 'UNSIGNED_BYTE',
				minFilter: 'NEAREST',
				magFilter: 'NEAREST',
			},
		);
		const initialColors = buildNewColorsArray(colorMap, paletteHexOrder);
		shader.initializeUniform('u_newColors', 'float', initialColors, { arrayLength: 32 });
		shader.initializeUniform('u_numColors', 'int', paletteHexOrder.length);
		shader.draw();

		containerRef.current.appendChild(canvas);

		return () => {
			if (shaderRef.current) {
				shaderRef.current.destroy();
				shaderRef.current = null;
			}
			if (containerRef.current) containerRef.current.innerHTML = '';
		};
	}, [paletteHexOrder]);

	useEffect(() => {
		processImageRef.current = processImage;
	});

	useEffect(() => {
		function onDragover(e) {
			if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
		}
		function onDrop(e) {
			e.preventDefault();
			const file = e.dataTransfer?.files?.[0];
			if (!file || !file.type.startsWith('image/')) return;
			const img = new Image();
			img.onload = () => processImageRef.current(img);
			img.src = URL.createObjectURL(file);
		}
		window.addEventListener('dragover', onDragover);
		window.addEventListener('drop', onDrop);
		return () => {
			window.removeEventListener('dragover', onDragover);
			window.removeEventListener('drop', onDrop);
		};
	}, []);

	function handleFileInput(e) {
		const file = e.target.files?.[0];
		if (!file) return;
		const img = new Image();
		img.onload = () => processImage(img);
		img.src = URL.createObjectURL(file);
	}

	function updateColor(hex, hsl) {
		setColorMap(prev => {
			const next = new Map(prev);
			next.set(hex, hsl);
			if (shaderRef.current && paletteHexOrder) {
				const colors = buildNewColorsArray(next, paletteHexOrder);
				shaderRef.current.updateUniforms({ u_newColors: colors });
				shaderRef.current.draw();
			}
			return next;
		});
	}

	useEffect(() => {
		function onKeyDown(e) {
			if ((e.metaKey || e.ctrlKey) && e.key === 's') {
				e.preventDefault();
				if (shaderRef.current) shaderRef.current.save('recolor.png');
			}
		}
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, []);

	function handleDragEnd(event) {
		setPaletteHexOrder(order => {
			const next = move(order, event);
			if (next === order) return order;
			if (shaderRef.current && colorMap) {
				const colors = buildNewColorsArray(colorMap, next);
				shaderRef.current.updateUniforms({ u_newColors: colors });
				shaderRef.current.draw();
			}
			return next;
		});
	}

	if (!colorMap) {
		return (
			<div className="drop-prompt">
				<p className="drop-prompt-text">Drag in an image with 32 colors max</p>
				<div className="corner corner-tl" />
				<div className="corner corner-tr" />
				<div className="corner corner-bl" />
				<div className="corner corner-br" />
				<input type="file" accept="image/*" onChange={handleFileInput} className="file-input" />
			</div>
		);
	}

	return (
		<div className={`app layout-${layout}`}>
			<div className="canvas-container" ref={containerRef} />
			<DragDropProvider onDragEnd={handleDragEnd}>
				<div className="sidebar">
					{paletteHexOrder.map((hex, index) => (
						<SortablePickerWrap
							key={hex}
							hex={hex}
							index={index}
							layout={layout}
							hsl={colorMap.get(hex)}
							updateColor={updateColor}
						/>
					))}
					<button type="button" className="save-btn" onClick={() => shaderRef.current?.save('recolor.png')}>
						Save image
					</button>
				</div>
			</DragDropProvider>
		</div>
	);
}

export default App;
