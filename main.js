let presets = {};
let currentPresetId = null;
let nextPresetId = 1;

let isSpinning = false;
let animFrame = null;
let spinStart = 0;
const SPIN_DURATION = 5000;
let startAngleRad = 0;
let targetRotationDelta = 0;
let targetSegmentIdx = -1;
let currentRotation = 0;
let canvas = document.getElementById('wheelCanvas');
let ctx = canvas.getContext('2d');
let wheelSize = 600;

const STORAGE_KEY = "lazy_spinner_wheels_v2";

let audioSpinStart = null;
let audioSpinning = null;
let audioSpinEnd = null;

function initAudio() {
    audioSpinStart = new Audio('spinStart.mp3');
    audioSpinning = new Audio('spinning.mp3');
    audioSpinEnd = new Audio('spinEnd.mp3');
    audioSpinning.loop = true;
}

function playSpinStart() {
    if (audioSpinStart) {
        audioSpinStart.currentTime = 0;
        audioSpinStart.play().catch(e => console.log("Audio play failed:", e));
    }
}

function playSpinning() {
    if (audioSpinning) {
        audioSpinning.currentTime = 0;
        audioSpinning.play().catch(e => console.log("Audio play failed:", e));
    }
}

function stopSpinning() {
    if (audioSpinning) {
        audioSpinning.pause();
        audioSpinning.currentTime = 0;
    }
}

function playSpinEnd() {
    if (audioSpinEnd) {
        audioSpinEnd.currentTime = 0;
        audioSpinEnd.play().catch(e => console.log("Audio play failed:", e));
    }
}

function saveToLocalStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        presets, currentPresetId, nextPresetId
    }));
}

function loadFromLocalStorage() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
        const data = JSON.parse(raw);
        if (data.presets && Object.keys(data.presets).length > 0) {
            presets = data.presets;
            currentPresetId = data.currentPresetId;
            nextPresetId = data.nextPresetId;
            if (!presets[currentPresetId]) {
                const firstKey = Object.keys(presets)[0];
                if (firstKey) currentPresetId = firstKey;
                else return false;
            }
            return true;
        }
    } catch(e) { console.warn(e); }
    return false;
}

function resetToDefaults() {
    if (confirm("Reset will erase all custom wheels and restore defaults. Continue?")) {
        presets = {};
        nextPresetId = 1;
        initDefaultPresets();
        saveToLocalStorage();
        fullRefresh();
        document.getElementById('selectedWheelLabel').innerText = presets[currentPresetId]?.name || "Wheel";
        toggleDropdown(true);
    }
}

function initDefaultPresets() {
    const defId = `preset_${nextPresetId++}`;
    presets[defId] = {
        name: "Coin Flip",
        items: [
            { text: "Heads", weight: 1.0 },
            { text: "Tails", weight: 1.0 },
        ]
    };
    const secondId = `preset_${nextPresetId++}`;
    presets[secondId] = {
        name: "1 Player",
        items: [
            { text: "¯\\_(ツ)_/¯", weight: 1.0 },
        ]
    };
    const thirdId = `preset_${nextPresetId++}`;
    presets[thirdId] = {
        name: "2 Players",
        items: [
            { text: "¯\\_(ツ)_/¯", weight: 1.0 },
        ]
    };
    const fourthdId = `preset_${nextPresetId++}`;
    presets[fourthdId] = {
        name: "3 Players",
        items: [
            { text: "¯\\_(ツ)_/¯", weight: 1.0 },
        ]
    };
    const fifthId = `preset_${nextPresetId++}`;
    presets[fifthId] = {
        name: "4 Players",
        items: [
            { text: "¯\\_(ツ)_/¯", weight: 1.0 },
        ]
    };
    currentPresetId = defId;
}

function getCurrentItems() {
    if (!currentPresetId || !presets[currentPresetId]) return [];
    return presets[currentPresetId].items;
}

function persistAndRefresh() {
    saveToLocalStorage();
    fullRefresh();
}

function addItemToCurrent(rawName) {
    let items = getCurrentItems();
    let name = rawName?.trim();
    if (!name) name = "item";
    items.push({ text: name, weight: 1.0 });
    presets[currentPresetId].items = items;
    persistAndRefresh();
}

function removeItemAtIndex(idx) {
    let items = getCurrentItems();
    if (idx >= 0 && idx < items.length) {
        items.splice(idx, 1);
        presets[currentPresetId].items = items;
        persistAndRefresh();
    }
}

function updateWeight(idx, newWeightVal) {
    let items = getCurrentItems();
    if (items[idx]) {
        let w = parseFloat(newWeightVal);
        if (isNaN(w)) w = 1.0;
        w = Math.max(0.1, Math.min(15.0, w));
        items[idx].weight = w;
        presets[currentPresetId].items = items;
        refreshWeightsPanel();
        drawWheel();
        saveToLocalStorage();
    }
}

function parseTextToItems(content) {
    let lines = content.split(/\r?\n/);
    let rawItems = [];
    for (let line of lines) {
        if (line.trim() === "") continue;
        let parts = line.split(',').map(p => p.trim()).filter(p => p.length > 0);
        if (parts.length > 0) {
            for (let part of parts) rawItems.push(part);
        } else if (line.trim().length > 0) {
            rawItems.push(line.trim());
        }
    }
    return rawItems;
}

function importFromTextFile(content) {
    let rawItems = parseTextToItems(content);
    if (rawItems.length === 0) {
        alert("No valid items found.");
        return false;
    }
    let newItems = rawItems.map(txt => ({ text: txt, weight: 1.0 }));
    if (currentPresetId && presets[currentPresetId]) {
        presets[currentPresetId].items = newItems;
        persistAndRefresh();
        return true;
    }
    return false;
}

function importFromPaste() {
    let text = prompt("Paste your list (comma separated):");
    if (!text || text.trim() === "") return;
    let rawItems = parseTextToItems(text);
    if (rawItems.length === 0) {
        alert("No valid items found. Use format: apple, banana, cherry");
        return;
    }
    let newItems = rawItems.map(txt => ({ text: txt, weight: 1.0 }));
    if (currentPresetId && presets[currentPresetId]) {
        presets[currentPresetId].items = newItems;
        persistAndRefresh();
    }
}

function drawWheel() {
    if (!ctx) return;
    const items = getCurrentItems();
    const n = items.length;
    ctx.clearRect(0, 0, wheelSize, wheelSize);
    if (n === 0) {
        ctx.fillStyle = "#20202a";
        ctx.fillRect(0, 0, wheelSize, wheelSize);
        ctx.fillStyle = "#aaa";
        ctx.font = "bold 24px system-ui";
        ctx.fillText("no items", wheelSize/2-55, wheelSize/2);
        return;
    }
    
    let totalWeight = items.reduce((s, it) => s + (it.weight || 1.0), 0);
    let segments = [];
    let start = 0;
    for (let i = 0; i < n; i++) {
        let w = items[i].weight || 1.0;
        let angleSpan = (w / totalWeight) * Math.PI * 2;
        segments.push({ start: start, end: start + angleSpan, idx: i, item: items[i] });
        start += angleSpan;
    }
    
    const center = wheelSize/2;
    const radius = wheelSize/2 - 20;
    
    for (let seg of segments) {
        let angleStart = seg.start + currentRotation;
        let angleEnd = seg.end + currentRotation;
        let hue = (seg.idx * 43) % 360;
        let sat = 40 + (seg.idx % 28);
        let light = 48 + (seg.idx % 18);
        ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.arc(center, center, radius, angleStart, angleEnd);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#191923";
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }
    
    ctx.font = "bold 18px 'Segoe UI'";
    ctx.fillStyle = "#ffffff";
    ctx.shadowBlur = 3;
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    for (let seg of segments) {
        let mid = seg.start + seg.end;
        mid = mid/2 + currentRotation;
        let textRad = radius * 0.7;
        let x = center + Math.cos(mid) * textRad;
        let y = center + Math.sin(mid) * textRad;
        let label = seg.item.text;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(mid + (mid > Math.PI/2 && mid < 3*Math.PI/2 ? Math.PI : 0));
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px system-ui";
        ctx.fillText(label, -25, 7);
        ctx.restore();
    }
    ctx.shadowBlur = 0;
    
    ctx.beginPath();
    ctx.arc(center, center, 18, 0, 2*Math.PI);
    ctx.fillStyle = "#12121a";
    ctx.fill();
    ctx.strokeStyle = "#3a3a44";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("▼", center-12, 30);
}

function getSegmentAtPointer(items, currentRot) {
    if (items.length === 0) return -1;
    
    let totalWeight = items.reduce((s, it) => s + (it.weight || 1.0), 0);
    let segments = [];
    let start = 0;
    for (let i = 0; i < items.length; i++) {
        let w = items[i].weight || 1.0;
        let angleSpan = (w / totalWeight) * Math.PI * 2;
        segments.push({ start: start, end: start + angleSpan, idx: i });
        start += angleSpan;
    }
    
    const POINTER_ANGLE = -Math.PI/2;
    let pointerAngle = POINTER_ANGLE;
    
    for (let seg of segments) {
        let segStart = seg.start + currentRot;
        let segEnd = seg.end + currentRot;
        
        let startNorm = ((segStart % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);
        let endNorm = ((segEnd % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);
        let pointerNorm = ((pointerAngle % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);
        
        if (startNorm < endNorm) {
            if (pointerNorm >= startNorm && pointerNorm < endNorm) {
                return seg.idx;
            }
        } else {
            if (pointerNorm >= startNorm || pointerNorm < endNorm) {
                return seg.idx;
            }
        }
    }
    return 0;
}

function startSpin() {
    if (isSpinning) return;
    const items = getCurrentItems();
    if (items.length === 0) {
        alert("Add items first.");
        return;
    }
    
    playSpinStart();
    playSpinning();
    
    let totalWeight = items.reduce((s, it) => s + (it.weight || 1.0), 0);
    let rand = Math.random() * totalWeight;
    let accum = 0;
    let chosen = 0;
    for (let i = 0; i < items.length; i++) {
        accum += (items[i].weight || 1.0);
        if (rand <= accum) { chosen = i; break; }
    }
    targetSegmentIdx = chosen;
    
    let totalWeightForAngles = items.reduce((s, it) => s + (it.weight || 1.0), 0);
    let segmentStart = 0;
    let targetStartAngle = 0;
    for (let i = 0; i < items.length; i++) {
        let w = items[i].weight || 1.0;
        let angleSpan = (w / totalWeightForAngles) * Math.PI * 2;
        if (i === chosen) {
            targetStartAngle = segmentStart;
            break;
        }
        segmentStart += angleSpan;
    }
    let targetEndAngle = targetStartAngle + ((items[chosen].weight || 1.0) / totalWeightForAngles) * Math.PI * 2;
    let targetMidAngle = targetStartAngle + (targetEndAngle - targetStartAngle) / 2;
    
    const POINTER_ANGLE = -Math.PI/2;
    let neededRotation = POINTER_ANGLE - targetMidAngle;
    neededRotation = ((neededRotation % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);
    
    let fullSpins = 8 + Math.random() * 7;
    let finalDelta = neededRotation + fullSpins * 2 * Math.PI;
    
    targetRotationDelta = finalDelta;
    startAngleRad = currentRotation;
    spinStart = performance.now();
    isSpinning = true;
    
    const easingSet = [
        t => 1 - Math.pow(1-t, 3.2),
        t => 1 - Math.pow(1-t, 2.8),
        t => 1 - Math.pow(1-t, 3.6),
        t => 1 - Math.pow(1-t, 4)
    ];
    const easeOutFunc = easingSet[Math.floor(Math.random() * easingSet.length)];
    
    function step(now) {
        let elapsed = now - spinStart;
        let t = Math.min(1, elapsed / SPIN_DURATION);
        let eased = easeOutFunc(t);
        let newRot = startAngleRad + targetRotationDelta * eased;
        currentRotation = newRot % (2*Math.PI);
        drawWheel();
        
        if (t < 1) {
            animFrame = requestAnimationFrame(step);
        } else {
            currentRotation = (startAngleRad + targetRotationDelta) % (2*Math.PI);
            drawWheel();
            isSpinning = false;
            cancelAnimationFrame(animFrame);
            
            stopSpinning();
            playSpinEnd();
            
            let finalItems = getCurrentItems();
            let finalIdx = getSegmentAtPointer(finalItems, currentRotation);
            if (finalIdx >= 0 && finalItems[finalIdx]) {
                showResultModal(finalItems[finalIdx].text, finalIdx);
            } else if (targetSegmentIdx >= 0 && finalItems[targetSegmentIdx]) {
                showResultModal(finalItems[targetSegmentIdx].text, targetSegmentIdx);
            }
        }
    }
    
    if (animFrame) cancelAnimationFrame(animFrame);
    animFrame = requestAnimationFrame(step);
}

let pendingRemoveIdx = null;
function showResultModal(name, idx) {
    pendingRemoveIdx = idx;
    document.getElementById('modalItemName').innerText = name;
    document.getElementById('resultModal').classList.remove('hidden');
}

function closeModal(shouldRemove) {
    document.getElementById('resultModal').classList.add('hidden');
    if (shouldRemove && pendingRemoveIdx !== null) {
        let items = getCurrentItems();
        if (pendingRemoveIdx >= 0 && pendingRemoveIdx < items.length) {
            items.splice(pendingRemoveIdx, 1);
            presets[currentPresetId].items = items;
            persistAndRefresh();
        }
    }
    pendingRemoveIdx = null;
}

function refreshItemsListVertical() {
    const container = document.getElementById('itemsListContainer');
    const items = getCurrentItems();
    document.getElementById('itemCountBadge').innerText = items.length;
    if (items.length === 0) {
        container.innerHTML = `<div class="text-center text-gray-500 py-8 text-xs">No items</div>`;
        return;
    }
    container.innerHTML = '';
    items.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'item-card-stack rounded-xl px-3 py-2 flex items-center justify-between gap-2 w-full';
        card.innerHTML = `
            <span class="truncate text-sm font-medium text-gray-200 flex-1">${escapeHtml(item.text)}</span>
            <button data-removeidx="${idx}" class="remove-stack-btn text-gray-400 hover:text-rose-400 transition w-6 h-6 rounded-full flex items-center justify-center"><i class="fa-solid fa-xmark text-xs"></i></button>
        `;
        container.appendChild(card);
    });
    document.querySelectorAll('.remove-stack-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            let idx = parseInt(btn.getAttribute('data-removeidx'));
            if (!isNaN(idx)) removeItemAtIndex(idx);
        });
    });
}

function refreshWeightsPanel() {
    const items = getCurrentItems();
    const weightDiv = document.getElementById('weightsContainer');
    if (items.length === 0) {
        weightDiv.innerHTML = `<div class="text-center text-gray-500 py-4 text-[11px]">no items</div>`;
        return;
    }
    weightDiv.innerHTML = '';
    items.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'flex flex-col gap-1 border-b border-gray-800/40 pb-2';
        row.innerHTML = `
            <div class="flex justify-between items-center text-xs">
                <span class="truncate max-w-[90px] text-gray-300">${escapeHtml(item.text)}</span>
                <input type="number" step="0.2" min="0.2" max="12" value="${item.weight.toFixed(1)}" data-weightidx="${idx}" class="weight-input w-[70px] text-center text-xs bg-[#0c0c12] border border-gray-700 rounded-full px-2 py-1">
            </div>
        `;
        weightDiv.appendChild(row);
    });
    document.querySelectorAll('.weight-input').forEach(inp => {
        inp.addEventListener('change', (e) => {
            let idx = parseInt(inp.getAttribute('data-weightidx'));
            let val = parseFloat(inp.value);
            if (isNaN(val)) val = 1.0;
            val = Math.min(12, Math.max(0.2, val));
            inp.value = val.toFixed(1);
            updateWeight(idx, val);
        });
    });
}

function refreshDropdownMenuComplete() {
    const menuDiv = document.getElementById('wheelTypesList');
    menuDiv.innerHTML = '';
    for (let [pid, preset] of Object.entries(presets)) {
        const active = (pid === currentPresetId);
        const opt = document.createElement('div');
        opt.className = `flex justify-between items-center w-full px-3 py-2 hover:bg-[#26262e] cursor-pointer text-sm ${active ? 'bg-indigo-900/30' : ''}`;
        opt.innerHTML = `
            <span class="truncate text-gray-200 flex-1">${escapeHtml(preset.name)}</span>
            <button data-preset="${pid}" class="del-preset text-gray-400 hover:text-red-400 text-xs w-6 h-6 rounded-full ml-2 flex-shrink-0"><i class="fa-solid fa-times"></i></button>
        `;
        opt.addEventListener('click', (e) => {
            if (e.target.classList.contains('del-preset')) return;
            if (pid !== currentPresetId) {
                currentPresetId = pid;
                document.getElementById('selectedWheelLabel').innerText = presets[currentPresetId].name;
                fullRefresh();
                toggleDropdown(false);
                saveToLocalStorage();
            }
        });
        const delBtn = opt.querySelector('.del-preset');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (Object.keys(presets).length <= 1) { alert("Need at least one wheel."); return; }
            delete presets[pid];
            if (currentPresetId === pid) {
                const firstKey = Object.keys(presets)[0];
                currentPresetId = firstKey;
                document.getElementById('selectedWheelLabel').innerText = presets[currentPresetId].name;
            }
            refreshDropdownMenuComplete();
            fullRefresh();
            saveToLocalStorage();
        });
        menuDiv.appendChild(opt);
    }
}

function fullRefresh() {
    refreshItemsListVertical();
    refreshWeightsPanel();
    drawWheel();
    refreshDropdownMenuComplete();
}

function toggleDropdown(forceHide) {
    const menu = document.getElementById('dropdownMenu');
    if (forceHide !== undefined) menu.classList.toggle('hidden', forceHide);
    else menu.classList.toggle('hidden');
}

function escapeHtml(str) { 
    return String(str).replace(/[&<>]/g, function(m){ 
        if(m==='&') return '&amp;'; 
        if(m==='<') return '&lt;'; 
        if(m==='>') return '&gt;'; 
        return m;
    }); 
}

window.addEventListener('load', () => {
    initAudio();
    document.getElementById('resetBtn').addEventListener('click', () => resetToDefaults());
    
    canvas.width = wheelSize;
    canvas.height = wheelSize;
    ctx = canvas.getContext('2d');
    
    const loaded = loadFromLocalStorage();
    if (!loaded || Object.keys(presets).length === 0) {
        initDefaultPresets();
        saveToLocalStorage();
    }
    if (!presets[currentPresetId]) {
        const first = Object.keys(presets)[0];
        if (first) currentPresetId = first;
    }
    fullRefresh();
    document.getElementById('selectedWheelLabel').innerText = presets[currentPresetId]?.name || "Wheel";
    
    canvas.addEventListener('click', () => { if (!isSpinning) startSpin(); });
    document.getElementById('addItemGlobalBtn').addEventListener('click', () => {
        let newLabel = prompt("New item name:");
        if (newLabel !== null && newLabel.trim() !== "") addItemToCurrent(newLabel);
        else if(newLabel !== null) addItemToCurrent("item");
    });
    document.getElementById('addWheelTypeBtn').addEventListener('click', () => {
        let name = prompt("New wheel name:");
        if (name && name.trim()) {
            let newId = `preset_${nextPresetId++}`;
            presets[newId] = { name: name.trim(), items: [{ text: "Sample", weight: 1.0 }] };
            currentPresetId = newId;
            document.getElementById('selectedWheelLabel').innerText = presets[currentPresetId].name;
            refreshDropdownMenuComplete();
            fullRefresh();
            toggleDropdown(false);
            saveToLocalStorage();
        }
    });
    document.getElementById('dropdownBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown(); });
    window.addEventListener('click', (e) => { if (!e.target.closest('#dropdownWrapper')) toggleDropdown(true); });
    document.getElementById('modalKeepBtn').addEventListener('click', () => closeModal(false));
    document.getElementById('modalRemoveBtn').addEventListener('click', () => closeModal(true));
    
    const fileInput = document.getElementById('txtFileInput');
    const importBtn = document.getElementById('importFileBtn');
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const success = importFromTextFile(ev.target.result);
            if(!success) alert("Import failed.");
            fileInput.value = '';
        };
        reader.onerror = () => alert("Error reading file");
        reader.readAsText(file, "UTF-8");
    });
    
    const pasteBtn = document.createElement('button');
    pasteBtn.className = 'bg-purple-800/50 hover:bg-purple-700/70 text-xs px-3 py-1.5 rounded-xl transition flex gap-1 items-center';
    pasteBtn.innerHTML = '<i class="fa-regular fa-clipboard"></i> Paste';
    pasteBtn.addEventListener('click', () => importFromPaste());
    const buttonContainer = document.querySelector('.flex.flex-wrap.justify-between.items-center.gap-2.mb-3 .flex.gap-2');
    if (buttonContainer) {
        buttonContainer.insertBefore(pasteBtn, buttonContainer.firstChild);
    }
});