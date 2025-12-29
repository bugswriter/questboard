document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const board = document.getElementById('board');
    const viewport = document.getElementById('viewport');
    const addBtn = document.getElementById('addBtn');
    const modalOverlay = document.getElementById('modalOverlay');
    const cancelBtn = document.getElementById('cancelBtn');
    const saveBtn = document.getElementById('saveBtn');
    const taskInput = document.getElementById('taskInput');
    const addTagBtn = document.getElementById('addTagBtn');

    // Zoom & Pan Controls
    const zoomLevelDisplay = document.getElementById('zoomLevel');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const fitBtn = document.getElementById('fitBtn');

    // Player Input
    const playerInput = document.getElementById('playerInput');
    const savePlayerBtn = document.getElementById('savePlayerBtn');
    const suggestionsList = document.getElementById('playerSuggestions');

    // File Input
    const imageInput = document.getElementById('imageInput');
    const fileNameDisplay = document.getElementById('fileNameDisplay');

    // Filters
    const filterDropdown = document.getElementById('filterDropdown');

    // Scroll Modal Elements
    const scrollModalOverlay = document.getElementById('scrollModalOverlay');
    const closeScrollBtn = document.getElementById('closeScrollBtn');
    const scrollTitle = document.getElementById('scrollTitle');
    const scrollText = document.getElementById('scrollText');
    const scrollImage = document.getElementById('scrollImage');
    const scrollTag = document.getElementById('scrollTag');
    const scrollAssignee = document.getElementById('scrollAssignee');
    const scrollDate = document.getElementById('scrollDate');

    // Lock Button
    const lockBtn = document.getElementById('lockBtn');

    // --- State Variables ---
    let isDragging = false;
    let currentNote = null;
    let offset = { x: 0, y: 0 };
    let zIndexCounter = 10;

    let scale = 1;
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let panOffset = { x: 0, y: 0 };

    let notesData = [];
    let tags = [];
    let players = [];
    let isBoardLocked = false;

    // --- API Functions ---

    async function loadData() {
        try {
            const res = await fetch('/api/data');
            const data = await res.json();

            // Update State
            notesData = data.notes;
            tags = data.tags;
            players = data.players;

            // Update Lock State
            if (isBoardLocked !== data.locked) {
                isBoardLocked = data.locked;
                updateLockUI();
            }

            // Render
            renderBoard();
            populateTags(); // Update dropdowns if tags changed
        } catch (err) {
            console.error("Failed to load data:", err);
        }
    }

    async function saveNoteAPI(note) {
        await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(note)
        });
        loadData(); // Refresh to ensure sync
    }

    async function deleteNoteAPI(id) {
        await fetch(`/api/notes/${id}`, { method: 'DELETE' });
        loadData();
    }

    async function addTagAPI(name, color) {
        await fetch('/api/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color })
        });
        loadData();
    }

    async function deleteTagAPI(name) {
        await fetch(`/api/tags/${name}`, { method: 'DELETE' });
        loadData();
    }

    async function addPlayerAPI(name) {
        await fetch('/api/players', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        loadData();
    }

    async function setLockAPI(locked) {
        await fetch('/api/lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locked })
        });
        loadData();
    }

    // --- UI Functions ---

    function updateLockUI() {
        if (lockBtn) {
            lockBtn.textContent = isBoardLocked ? '🔒' : '🔓';
            lockBtn.style.borderColor = isBoardLocked ? '#ef4444' : 'var(--gold)';
            lockBtn.title = isBoardLocked ? 'Unlock Board' : 'Lock Board';
        }
        if (viewport) {
            viewport.style.cursor = isBoardLocked ? 'default' : 'grab';
        }

        // Update cursor for all notes
        const notes = document.querySelectorAll('.note');
        notes.forEach(n => {
            n.style.cursor = isBoardLocked ? 'pointer' : 'grab';
        });
    }

    function renderBoard() {
        // Clear existing notes (inefficient but simple for now)
        // Optimization: Only remove/add changed notes if needed.
        // For now, let's just clear and redraw to ensure 100% sync.
        const existingNotes = document.querySelectorAll('.note');
        existingNotes.forEach(n => n.remove());

        notesData.forEach(data => {
            const tagObj = tags.find(t => t.name === data.tag) || { name: data.tag, color: '#800000' };
            createNoteElement(data, tagObj);
        });

        filterNotes(); // Re-apply filters
    }

    function populateTags() {
        // Populate Filter Dropdown
        const filterMenu = document.querySelector('#filterDropdown .dropdown-menu');
        if (filterMenu) {
            const currentFilter = filterDropdown.dataset.value || 'all';
            filterMenu.innerHTML = '<div class="dropdown-item" data-value="all">All Tags</div>';
            tags.forEach(tag => {
                const filterItem = document.createElement('div');
                filterItem.className = 'dropdown-item';
                if (tag.name === currentFilter) filterItem.classList.add('active');
                filterItem.dataset.value = tag.name;
                filterItem.textContent = tag.name;
                filterMenu.appendChild(filterItem);
            });
            // Reset active class for 'All' if needed
            if (currentFilter === 'all') filterMenu.querySelector('[data-value="all"]').classList.add('active');
        }

        // Populate Modal Dropdown
        const tagMenu = document.querySelector('#tagDropdown .dropdown-menu');
        if (tagMenu) {
            tagMenu.innerHTML = '';
            tags.forEach(tag => {
                const tagItem = document.createElement('div');
                tagItem.className = 'dropdown-item';
                tagItem.dataset.value = tag.name;

                const textSpan = document.createElement('span');
                textSpan.textContent = tag.name;
                tagItem.appendChild(textSpan);

                const deleteBtn = document.createElement('div');
                deleteBtn.className = 'delete-tag-btn';
                deleteBtn.textContent = '×';
                deleteBtn.title = 'Delete Tag';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`Delete tag "${tag.name}"?`)) {
                        deleteTagAPI(tag.name);
                    }
                });
                tagItem.appendChild(deleteBtn);
                tagMenu.appendChild(tagItem);
            });
        }

        setupDropdowns();
    }

    function setupDropdowns() {
        document.querySelectorAll('.custom-dropdown').forEach(dropdown => {
            // Clone to remove old listeners
            const newDropdown = dropdown.cloneNode(true);
            dropdown.parentNode.replaceChild(newDropdown, dropdown);

            const trigger = newDropdown.querySelector('.dropdown-trigger');
            const items = newDropdown.querySelectorAll('.dropdown-item');

            trigger.onclick = (e) => {
                e.stopPropagation();
                closeAllDropdowns();
                newDropdown.classList.toggle('open');
            };

            items.forEach(item => {
                item.onclick = () => {
                    const value = item.dataset.value;
                    const text = item.textContent.replace('×', '').trim();

                    newDropdown.querySelector('.selected-value').textContent = text;
                    newDropdown.dataset.value = value;

                    items.forEach(i => i.classList.remove('active'));
                    item.classList.add('active');

                    newDropdown.classList.remove('open');

                    if (newDropdown.id === 'filterDropdown') {
                        filterNotes();
                    }
                };
            });
        });

        // Re-assign global variables if elements were replaced
        // Actually, replacing nodes breaks references. Better to just attach listeners carefully.
        // For this quick fix, let's just assume simple attachment is fine or handle duplicates.
        // Re-querying needed elements:
        // filterDropdown = document.getElementById('filterDropdown'); // const cannot be reassigned
    }

    function closeAllDropdowns() {
        document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('open'));
    }

    function filterNotes() {
        const filterDropdown = document.getElementById('filterDropdown');
        const tagFilter = filterDropdown ? (filterDropdown.dataset.value || 'all') : 'all';
        const notes = document.querySelectorAll('.note');

        notes.forEach(note => {
            const noteTag = note.dataset.tag;
            const tagMatch = tagFilter === 'all' || noteTag === tagFilter;
            note.style.display = tagMatch ? 'flex' : 'none';
        });
    }

    function createNoteElement(data, tagObj) {
        const note = document.createElement('div');
        note.classList.add('note');
        note.dataset.id = data.id;
        note.dataset.tag = tagObj.name;
        note.dataset.assignee = data.assignee;

        note.style.setProperty('--rotation', `${data.rotation}deg`);
        note.style.transform = `rotate(${data.rotation}deg)`;
        note.style.left = `${data.x}px`;
        note.style.top = `${data.y}px`;

        // Image Attachment
        if (data.image) {
            const img = document.createElement('img');
            img.src = data.image;
            img.classList.add('note-image');
            note.appendChild(img);
        }

        const content = document.createElement('div');
        content.classList.add('note-content');
        content.textContent = data.text;
        note.appendChild(content);

        const tagElem = document.createElement('div');
        tagElem.classList.add('note-tag');
        tagElem.textContent = tagObj.name;
        tagElem.style.backgroundColor = tagObj.color;
        note.appendChild(tagElem);

        // Footer
        const footer = document.createElement('div');
        footer.classList.add('note-footer');

        const assigneeElem = document.createElement('div');
        assigneeElem.classList.add('note-assignee');
        assigneeElem.textContent = `~ ${data.assignee}`;
        footer.appendChild(assigneeElem);

        const dateElem = document.createElement('div');
        dateElem.classList.add('note-creation-date');
        dateElem.textContent = data.date;
        footer.appendChild(dateElem);

        note.appendChild(footer);

        // Delete Button
        const deleteBtn = document.createElement('div');
        deleteBtn.classList.add('delete-note-btn');
        deleteBtn.innerHTML = '☠';
        deleteBtn.title = 'Abandon Quest';
        deleteBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isBoardLocked) {
                alert("Board is locked! Unlock to abandon quests.");
                return;
            }
            if (confirm('Are you sure you want to abandon this quest?')) {
                deleteNoteAPI(data.id);
            }
        });
        note.appendChild(deleteBtn);

        // Drag & Click Logic
        let startX, startY;

        note.addEventListener('mousedown', (e) => {
            e.stopPropagation();

            startX = e.clientX;
            startY = e.clientY;

            if (isBoardLocked) return;

            isDragging = true;
            currentNote = note;

            const rect = note.getBoundingClientRect();
            offset.x = (e.clientX - rect.left) / scale;
            offset.y = (e.clientY - rect.top) / scale;

            zIndexCounter++;
            note.style.zIndex = zIndexCounter;
        });

        note.addEventListener('mouseup', (e) => {
            const dist = Math.sqrt(Math.pow(e.clientX - startX, 2) + Math.pow(e.clientY - startY, 2));
            if (dist < 5) { // Click
                openScroll(data);
            }
        });

        board.appendChild(note);
    }

    // --- Interaction Logic ---

    if (lockBtn) {
        lockBtn.addEventListener('click', () => {
            setLockAPI(!isBoardLocked);
        });
    }

    function openScroll(data) {
        scrollTitle.textContent = data.tag;
        scrollText.textContent = data.text;

        if (data.image) {
            scrollImage.src = data.image;
            scrollImage.classList.remove('hidden');
        } else {
            scrollImage.classList.add('hidden');
        }

        const tagObj = tags.find(t => t.name === data.tag) || { color: '#800000' };
        scrollTag.textContent = data.tag;
        scrollTag.style.backgroundColor = tagObj.color;

        scrollAssignee.textContent = `Signed by: ${data.assignee}`;
        scrollDate.textContent = `Issued: ${data.date}`;

        scrollModalOverlay.classList.add('active');
    }

    if (closeScrollBtn) {
        closeScrollBtn.addEventListener('click', () => {
            scrollModalOverlay.classList.remove('active');
        });
    }
    scrollModalOverlay.addEventListener('click', (e) => {
        if (e.target === scrollModalOverlay) scrollModalOverlay.classList.remove('active');
    });

    // Zoom & Pan
    const updateTransform = () => {
        board.style.transform = `translate(calc(-50% + ${panOffset.x}px), calc(-50% + ${panOffset.y}px)) scale(${scale})`;
        zoomLevelDisplay.textContent = `${Math.round(scale * 100)}%`;
    };

    const zoom = (delta) => {
        const newScale = scale + delta;
        if (newScale >= 0.1 && newScale <= 3) {
            scale = newScale;
            updateTransform();
        }
    };

    if (zoomInBtn) zoomInBtn.addEventListener('click', () => zoom(0.1));
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => zoom(-0.1));
    if (fitBtn) {
        fitBtn.addEventListener('click', () => {
            panOffset = { x: 0, y: 0 };
            const viewportWidth = viewport.clientWidth;
            const viewportHeight = viewport.clientHeight;
            const scaleX = viewportWidth / 3200;
            const scaleY = viewportHeight / 1800;
            scale = Math.min(scaleX, scaleY);
            if (scale < 0.1) scale = 0.1;
            if (scale > 3) scale = 3;
            updateTransform();
        });
    }

    if (viewport) {
        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            zoom(e.deltaY * -0.001);
        });

        viewport.addEventListener('mousedown', (e) => {
            if (isBoardLocked) return;
            if (e.target === viewport || e.target === board || e.target.classList.contains('quadrant')) {
                isPanning = true;
                panStart.x = e.clientX - panOffset.x;
                panStart.y = e.clientY - panOffset.y;
                viewport.style.cursor = 'grabbing';
            }
        });
    }

    window.addEventListener('mousemove', (e) => {
        if (isPanning) {
            panOffset.x = e.clientX - panStart.x;
            panOffset.y = e.clientY - panStart.y;
            updateTransform();
        }

        if (isDragging && currentNote) {
            e.preventDefault();
            const rect = board.getBoundingClientRect();
            const relX = (e.clientX - rect.left) / scale - (offset.x);
            const relY = (e.clientY - rect.top) / scale - (offset.y);

            currentNote.style.left = `${relX}px`;
            currentNote.style.top = `${relY}px`;
        }
    });

    window.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            if (viewport) viewport.style.cursor = isBoardLocked ? 'not-allowed' : 'grab';
        }
        if (isDragging && currentNote) {
            isDragging = false;

            // Save new position
            const id = currentNote.dataset.id;
            const noteObj = notesData.find(n => n.id === id);
            if (noteObj) {
                noteObj.x = parseFloat(currentNote.style.left);
                noteObj.y = parseFloat(currentNote.style.top);
                // Optimistic update already happened visually
                saveNoteAPI(noteObj);
            }

            currentNote = null;
        }
    });

    // Modal Logic
    const openModal = () => {
        modalOverlay.classList.add('active');
        taskInput.focus();
    };
    const closeModal = () => {
        modalOverlay.classList.remove('active');
        taskInput.value = '';
        if (imageInput) imageInput.value = '';
        if (playerInput) playerInput.value = '';
        if (fileNameDisplay) fileNameDisplay.textContent = 'No sketch attached';
    };

    if (addBtn) addBtn.addEventListener('click', openModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    // Save Note
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const text = taskInput.value.trim();
            const dropdown = document.getElementById('tagDropdown');
            const tagName = dropdown.dataset.value;

            const assignee = playerInput ? (playerInput.value.trim() || 'Anonymous') : 'Anonymous';
            const file = imageInput ? imageInput.files[0] : null;

            const now = new Date();
            const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            if (text && tagName) {
                const id = Date.now().toString();
                const boardWidth = 3200;
                const boardHeight = 1800;
                const x = (boardWidth / 2) - 90 + (Math.random() * 100 - 50);
                const y = (boardHeight / 2) - 90 + (Math.random() * 100 - 50);
                const rotation = Math.random() * 6 - 3;

                const newNote = {
                    id, text, tag: tagName, assignee, date: dateStr, image: null, x, y, rotation
                };

                if (file) {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        newNote.image = e.target.result;
                        saveNoteAPI(newNote);
                    };
                    reader.readAsDataURL(file);
                } else {
                    saveNoteAPI(newNote);
                }
                closeModal();
            }
        });
    }

    // Tag & Player Management
    if (addTagBtn) {
        addTagBtn.addEventListener('click', () => {
            const newTagName = prompt("Enter new tag name:");
            if (newTagName) {
                const hue = Math.floor(Math.random() * 360);
                const color = `hsl(${hue}, 70%, 30%)`;
                addTagAPI(newTagName, color);
            }
        });
    }

    if (playerInput && suggestionsList) {
        playerInput.addEventListener('input', () => {
            const val = playerInput.value.toLowerCase();
            suggestionsList.innerHTML = '';
            if (!val) { suggestionsList.style.display = 'none'; return; }

            const matches = players.filter(p => p.toLowerCase().includes(val));
            if (matches.length > 0) {
                matches.forEach(match => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.textContent = match;
                    div.onclick = () => {
                        playerInput.value = match;
                        suggestionsList.style.display = 'none';
                    };
                    suggestionsList.appendChild(div);
                });
                suggestionsList.style.display = 'block';
            } else {
                suggestionsList.style.display = 'none';
            }
        });
    }

    if (savePlayerBtn) {
        savePlayerBtn.addEventListener('click', () => {
            const name = playerInput.value.trim();
            if (name) addPlayerAPI(name);
        });
    }

    // File Upload
    if (imageInput && fileNameDisplay) {
        imageInput.addEventListener('change', () => {
            if (imageInput.files && imageInput.files.length > 0) {
                fileNameDisplay.textContent = imageInput.files[0].name;
            } else {
                fileNameDisplay.textContent = 'No sketch attached';
            }
        });
    }

    window.addEventListener('click', () => {
        closeAllDropdowns();
        if (suggestionsList) suggestionsList.style.display = 'none';
    });

    // --- Start ---
    loadData();
    // Polling
    setInterval(loadData, 2000);
});
