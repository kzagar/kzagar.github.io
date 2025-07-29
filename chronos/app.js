document.addEventListener('DOMContentLoaded', () => {
    const taskTableBody = document.querySelector('#task-table tbody');
    const taskRowTemplate = document.querySelector('#task-row-template');
    const newTaskInput = document.querySelector('#new-task-row .new-task-input');

    let tasks = [];
    let currentlyRunningTaskId = -1; // -1 means no task is running
    let nextTaskId = 1; // Start ID from 1
    let taskOrder = [];

    let journals = []; // New array to store journal entries
    let currentJournalTaskId = null; // To store the task ID for the current journal entry
    let tasksWithVisibleJournals = []; // New array to store task IDs whose journals are visible

    let draggedItem = null;

    // Helper function to format time
    function formatTime(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const pad = (num) => num.toString().padStart(2, '0');

        if (hours > 0) {
            return `${hours}:${pad(minutes)}:${pad(seconds)}`;
        } else {
            return `${minutes}:${pad(seconds)}`;
        }
    }

    // Load tasks from localStorage
    function loadTasks() {
        const savedTasks = localStorage.getItem('chronosTasks');
        const savedTaskOrder = localStorage.getItem('chronosTaskOrder');
        const savedRunningTaskId = localStorage.getItem('chronosRunningTaskId');
        const savedJournals = localStorage.getItem('chronosJournals');
        const savedTasksWithVisibleJournals = localStorage.getItem('chronosTasksWithVisibleJournals');

        if (savedTasks) {
            tasks = JSON.parse(savedTasks);
            // Re-initialize intervals to null as they are not stringifiable
            tasks.forEach(task => {
                task.interval = null;
            });
            nextTaskId = Math.max(...tasks.map(t => t.id)) + 1;
        } else {
            // Initial tasks if no saved data
            tasks = [
                { id: 1, name: 'Task 1', time: 0, interval: null },
                { id: 2, name: 'Task 2', time: 0, interval: null },
                { id: 3, name: 'Task 3', time: 0, interval: null },
            ];
            nextTaskId = Math.max(...tasks.map(t => t.id)) + 1;
        }

        if (savedTaskOrder) {
            taskOrder = JSON.parse(savedTaskOrder);
        } else {
            taskOrder = tasks.map(task => task.id);
        }

        if (savedRunningTaskId !== null) {
            currentlyRunningTaskId = parseInt(savedRunningTaskId, 10);
            // If a task was running, restart its timer
            const runningTask = tasks.find(t => t.id === currentlyRunningTaskId);
            if (runningTask) {
                runningTask.interval = setInterval(() => {
                    runningTask.time++;
                    const timeCell = document.querySelector(`tr[data-id='${runningTask.id}'] .task-time`);
                    if (timeCell) timeCell.textContent = formatTime(runningTask.time);
                    saveTasks(); // Save on every time update
                }, 1000);
            } else {
                currentlyRunningTaskId = -1; // Task not found, reset
            }
        }

        if (savedJournals) {
            journals = JSON.parse(savedJournals);
        }

        if (savedTasksWithVisibleJournals) {
            tasksWithVisibleJournals = JSON.parse(savedTasksWithVisibleJournals);
        }
    }

    // Save tasks to localStorage
    function saveTasks() {
        localStorage.setItem('chronosTasks', JSON.stringify(tasks));
        localStorage.setItem('chronosTaskOrder', JSON.stringify(taskOrder));
        localStorage.setItem('chronosRunningTaskId', currentlyRunningTaskId.toString());
        saveJournals(); // Also save journals when tasks are saved
        saveTasksWithVisibleJournals();
    }

    function saveTasksWithVisibleJournals() {
        localStorage.setItem('chronosTasksWithVisibleJournals', JSON.stringify(tasksWithVisibleJournals));
    }

    // Save journals to localStorage
    function saveJournals() {
        localStorage.setItem('chronosJournals', JSON.stringify(journals));
    }

    function renderTasks() {
        const newTaskRowElement = document.getElementById('new-task-row');
        
        Array.from(taskTableBody.children).forEach(child => {
            if (child.id !== 'new-task-row') {
                child.remove();
            }
        });

        if (taskTableBody.firstChild !== newTaskRowElement) {
            taskTableBody.prepend(newTaskRowElement);
        }

        for (let i = taskOrder.length - 1; i >= 0; i--) {
            const taskId = taskOrder[i];
            const task = tasks.find(t => t.id === taskId);
            if (!task) continue;

            const templateClone = taskRowTemplate.content.cloneNode(true);
            const row = templateClone.querySelector('tr');
            row.dataset.id = task.id;
            
            const taskNameCell = templateClone.querySelector('.task-name');
            taskNameCell.textContent = task.name;
            taskNameCell.contentEditable = true;
            taskNameCell.dataset.taskId = task.id;

            templateClone.querySelector('.task-time').textContent = formatTime(task.time);
            
            const startPauseBtn = templateClone.querySelector('.start-pause-btn');
            startPauseBtn.textContent = (task.id === currentlyRunningTaskId) ? '❚❚' : '▶';

            const showJournalCheckbox = templateClone.querySelector('.show-journal-checkbox');
            showJournalCheckbox.checked = tasksWithVisibleJournals.includes(task.id);
            showJournalCheckbox.dataset.taskId = task.id;

            taskTableBody.insertBefore(templateClone, newTaskRowElement.nextSibling);
        }
    }

    function toggleTimer(taskId) {
        const taskToToggle = tasks.find(t => t.id === taskId);
        if (!taskToToggle) return;

        if (currentlyRunningTaskId === taskId) {
            clearInterval(taskToToggle.interval);
            taskToToggle.interval = null;
            currentlyRunningTaskId = -1;
        } else {
            if (currentlyRunningTaskId !== -1) {
                const runningTask = tasks.find(t => t.id === currentlyRunningTaskId);
                if (runningTask) {
                    clearInterval(runningTask.interval);
                    runningTask.interval = null;
                }
            }

            currentlyRunningTaskId = taskId;
            taskToToggle.interval = setInterval(() => {
                taskToToggle.time++;
                const timeCell = document.querySelector(`tr[data-id='${taskToToggle.id}'] .task-time`);
                if (timeCell) timeCell.textContent = formatTime(taskToToggle.time);
                saveTasks();
            }, 1000);
        }
        saveTasks();
        renderTasks();
    }

    function updateTaskName(taskId, newName) {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            task.name = newName;
            saveTasks();
        }
    }

    function addNewTask(taskName) {
        if (taskName.trim() === '') return;

        const newTask = {
            id: nextTaskId++,
            name: taskName.trim(),
            time: 0,
            interval: null
        };
        tasks.unshift(newTask);
        taskOrder.unshift(newTask.id);
        saveTasks();
        renderTasks();
        newTaskInput.textContent = '';
    }

    function deleteTask(taskId) {
        const taskToDelete = tasks.find(t => t.id === taskId);
        if (!taskToDelete) return;

        if (confirm(`Are you sure you want to delete "${taskToDelete.name}"?`)) {
            if (taskToDelete.interval) {
                clearInterval(taskToDelete.interval);
            }
            tasks = tasks.filter(task => task.id !== taskId);
            taskOrder = taskOrder.filter(id => id !== taskId);
            if (currentlyRunningTaskId === taskId) {
                currentlyRunningTaskId = -1;
            }
            // Also remove from tasksWithVisibleJournals if deleted task was there
            tasksWithVisibleJournals = tasksWithVisibleJournals.filter(id => id !== taskId);
            saveTasks();
            renderTasks();
            renderJournalEntries(); // Re-render journals after task deletion
        }
    }

    taskTableBody.addEventListener('click', (e) => {
        const target = e.target;
        const row = target.closest('tr');
        if (!row) return;
        
        const taskId = parseInt(row.dataset.id, 10);

        if (target.classList.contains('start-pause-btn')) {
            toggleTimer(taskId);
        } else if (target.classList.contains('journal-btn')) {
            currentJournalTaskId = taskId; // Set the task ID for the journal
            showJournalDialog();
        } else if (target.classList.contains('delete-btn')) {
            deleteTask(taskId);
        } else if (target.classList.contains('show-journal-checkbox')) {
            if (target.checked) {
                if (!tasksWithVisibleJournals.includes(taskId)) {
                    tasksWithVisibleJournals.push(taskId);
                }
            } else {
                tasksWithVisibleJournals = tasksWithVisibleJournals.filter(id => id !== taskId);
            }
            saveTasksWithVisibleJournals();
            renderJournalEntries();
        }
    });

    taskTableBody.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('task-name')) {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.target.blur();
            } else if (e.key === 'Escape') {
                e.target.textContent = tasks.find(t => t.id === parseInt(e.target.dataset.taskId)).name;
                e.target.blur();
            }
        } else if (e.target.classList.contains('new-task-input')) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addNewTask(e.target.textContent);
            }
        }
    });

    taskTableBody.addEventListener('blur', (e) => {
        if (e.target.classList.contains('task-name')) {
            const taskId = parseInt(e.target.dataset.taskId, 10);
            const newName = e.target.textContent.trim();
            updateTaskName(taskId, newName);
        }
    }, true);

    // Drag and Drop functionality
    taskTableBody.addEventListener('dragstart', (e) => {
        if (e.target.tagName === 'TR' && e.target.id !== 'new-task-row') {
            draggedItem = e.target;
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => {
                e.target.style.opacity = '0.5';
            }, 0);
        }
    });

    taskTableBody.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.target.closest('tr') && e.target.closest('tr').id !== 'new-task-row' && draggedItem) {
            const currentItem = e.target.closest('tr');
            if (currentItem !== draggedItem) {
                const bounding = currentItem.getBoundingClientRect();
                const offset = bounding.y + (bounding.height / 2);
                if (e.clientY > offset) {
                    currentItem.style.borderBottom = '2px solid blue';
                    currentItem.style.borderTop = '';
                } else {
                    currentItem.style.borderTop = '2px solid blue';
                    currentItem.style.borderBottom = '';
                }
            }
        }
    });

    taskTableBody.addEventListener('dragleave', (e) => {
        if (e.target.closest('tr')) {
            e.target.closest('tr').style.borderTop = '';
            e.target.closest('tr').style.borderBottom = '';
        }
    });

    taskTableBody.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.target.closest('tr') && e.target.closest('tr').id !== 'new-task-row' && draggedItem) {
            const droppedOnItem = e.target.closest('tr');
            const droppedOnId = parseInt(droppedOnItem.dataset.id, 10);
            const draggedId = parseInt(draggedItem.dataset.id, 10);

            const fromIndex = taskOrder.indexOf(draggedId);
            const toIndex = taskOrder.indexOf(droppedOnId);

            if (fromIndex !== -1 && toIndex !== -1) {
                taskOrder.splice(fromIndex, 1);
                taskOrder.splice(toIndex, 0, draggedId);
                saveTasks();
            }
            
            renderTasks();
        }
        draggedItem.style.opacity = '';
        if (e.target.closest('tr')) {
            e.target.closest('tr').style.borderTop = '';
            e.target.closest('tr').style.borderBottom = '';
        }
    });

    taskTableBody.addEventListener('dragend', (e) => {
        draggedItem.style.opacity = '';
        taskTableBody.querySelectorAll('tr').forEach(row => {
            row.style.borderTop = '';
            row.style.borderBottom = '';
        });
        draggedItem = null;
    });

    // Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(registration => {
                    console.log('Service Worker registered: ', registration);
                })
                .catch(error => {
                    console.log('Service Worker registration failed: ', error);
                });
        });
    }

    // Journal Dialog Elements
    const journalDialog = document.getElementById('journal-dialog');
    const journalInput = document.getElementById('journal-input');
    const addJournalBtn = document.getElementById('add-journal-btn');
    const discardJournalBtn = document.getElementById('discard-journal-btn');

    function showJournalDialog() {
        journalDialog.style.display = 'flex';
        journalInput.value = ''; // Clear previous input
        journalInput.focus();
    }

    function hideJournalDialog() {
        journalDialog.style.display = 'none';
        journalInput.value = '';
        currentJournalTaskId = null; // Clear the current task ID
    }

    function addJournalEntry() {
        const content = journalInput.value.trim();
        if (content === '') {
            alert('Journal entry cannot be empty.');
            return;
        }

        if (currentJournalTaskId === null) {
            alert('No task selected for journal entry.');
            return;
        }

        const now = new Date();
        const newJournal = {
            taskId: currentJournalTaskId,
            time: now.toISOString(), // ISO 8601 format
            content: content
        };

        journals.push(newJournal);
        saveJournals();
        hideJournalDialog();
        console.log('Journal Entries:', journals); // For debugging
        renderJournalEntries(); // Re-render journal entries after adding a new one
    }

    // Event Listeners for Journal Dialog
    addJournalBtn.addEventListener('click', addJournalEntry);
    discardJournalBtn.addEventListener('click', hideJournalDialog);

    // Keyboard shortcuts for journal dialog
    journalDialog.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideJournalDialog();
        } else if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault(); // Prevent new line in textarea
            addJournalEntry();
        }
    });

    // Helper function to format journal time
    function formatJournalTime(isoString) {
        const date = new Date(isoString);
        const options = { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        return date.toLocaleString('en-US', options);
    }

    // Render Journal Entries
    function renderJournalEntries() {
        const journalEntriesTableBody = document.querySelector('#journal-entries-table tbody');
        const journalEntryTemplate = document.querySelector('#journal-entry-template');
        const journalEntriesContainer = document.getElementById('journal-entries-container');
        const mainContainer = document.querySelector('.main-container'); // Get main-container

        // Clear existing entries
        journalEntriesTableBody.innerHTML = '';

        const tasksToShowJournal = tasks.filter(task => tasksWithVisibleJournals.includes(task.id));

        if (tasksToShowJournal.length > 0) {
            mainContainer.classList.add('show-journals'); // Add class to main-container
            
            tasksToShowJournal.forEach(task => {
                const taskJournals = journals.filter(journal => journal.taskId === task.id);
                if (taskJournals.length > 0) {
                    // Add a header for the task
                    const taskHeaderRow = document.createElement('tr');
                    const taskHeaderCell = document.createElement('td');
                    taskHeaderCell.colSpan = 2;
                    taskHeaderCell.innerHTML = `<strong>Task: ${task.name}</strong>`;
                    journalEntriesTableBody.appendChild(taskHeaderRow);
                    taskHeaderRow.appendChild(taskHeaderCell);

                    taskJournals.sort((a, b) => new Date(a.time) - new Date(b.time)); // Sort by time

                    taskJournals.forEach(journal => {
                        const templateClone = journalEntryTemplate.content.cloneNode(true);
                        templateClone.querySelector('.journal-time').textContent = formatJournalTime(journal.time);
                        templateClone.querySelector('.journal-content').textContent = journal.content;
                        journalEntriesTableBody.appendChild(templateClone);
                    });
                }
            });
        } else {
            mainContainer.classList.remove('show-journals'); // Remove class from main-container
        }
    }

    // Initial load
    loadTasks();
    renderTasks();
    renderJournalEntries(); // Initial render of journal entries
});