
let showPopup = false;
const api = "https://unmalicious-feverish-delora.ngrok-free.dev/";
let canplayaudioaiaudio = true;
const errorsound = new Audio("error.mp3");
const loadsound = new Audio("loading.mp3")
const worksound = new Audio("work.mp3")

loadsound.loop = true

const olderror = console.error;

console.error = function(message) {
    if (canplayaudioaiaudio) {
        errorsound.currentTime = 0;
        errorsound.play();
    }
    olderror(message);
};

document.getElementById("chatbox").addEventListener("keydown", function(event) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage(event.currentTarget);
    }
});

function scalebox(element) {
    element.style.height = "20px";
    element.style.height = Math.max(20, element.scrollHeight) + "px";
}

let aiController = null;

const sessionId = (() => {
    let id = sessionStorage.getItem("chatSessionId");

    if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem("chatSessionId", id);
    }

    return id;
})();

const historyKey = `chatHistory_${sessionId}`;
const displayKey = `chatDisplay_${sessionId}`;

let chatHistory = [];

try {
    chatHistory = JSON.parse(
        localStorage.getItem(historyKey) || "[]"
    );

    if (!Array.isArray(chatHistory)) {
        chatHistory = [];
    }
} catch {
    chatHistory = [];
}

function setselectedaimodel(option) {
    localStorage.setItem("selectedAIModel", option);
}

function askoverwrite() {
    const canoverwrite = confirm("The saved chat will be PERMANENTLY deleted, Continue?");

    if (canoverwrite) {
        clearSavedChat();
    }
}

function asksave(option) {
    const canoverwrite = confirm("Changing this option is gonna clear the currently saved chat, Continue?");

    if (canoverwrite) {
        setselectedaimodel(option);
        clearSavedChat();
    } else {
        const select = document.getElementById("model");
        const savedModel = localStorage.getItem("selectedAIModel");
        select.value = savedModel;
    }
}

function loadselectedaimodel() {
    const savedModel = localStorage.getItem("selectedAIModel");
    const select = document.getElementById("model");

    if (savedModel && [...select.options].some(option => option.value === savedModel)) {
        select.value = savedModel;
    }
}

const preload = localStorage.getItem("selectedAIModel");

if (!preload) {
    setselectedaimodel("Default");
}

window.addEventListener("DOMContentLoaded", loadselectedaimodel);

function updateAILevel(value) {
    const text = {
        1: "Low",
        2: "Medium",
        3: "High"
    };

    document.getElementById("selectailvltext").textContent =
        "AI Level (" + (text[value] || "Low") + ")";
}

function loadAILevel() {
    const slider = document.getElementById("level");
    const savedLevel = Number(localStorage.getItem("selectedAILevel")) || 1;

    slider.value = Math.min(
        Number(slider.max),
        Math.max(Number(slider.min), savedLevel)
    );

    updateAILevel(Number(slider.value));
}

function saveAILevel() {
    const slider = document.getElementById("level");
    const level = Number(slider.value);

    localStorage.setItem("selectedAILevel", level);
    updateAILevel(level);
}

function confirmAILevel() {
    const slider = document.getElementById("level");
    const previousLevel = Number(localStorage.getItem("selectedAILevel")) || 1;
    const newLevel = Number(slider.value);

    if (newLevel === previousLevel) return;

    if (confirm("Changing the AI level is gonna clear the currently saved chat, Continue?")) {
        saveAILevel();
        clearSavedChat();
    } else {
        slider.value = previousLevel;
        updateAILevel(previousLevel);
    }
}

function saveChat() {
    localStorage.setItem(
        historyKey,
        JSON.stringify(chatHistory)
    );

    const response = document.getElementById("response");

    localStorage.setItem(
        displayKey,
        JSON.stringify(
            Array.from(response.children).map(element => ({
                tag: element.tagName === "P" ? "p" : "div",
                text: element.textContent
            }))
        )
    );
}

function loadChat() {
    const response = document.getElementById("response");

    try {
        const saved = JSON.parse(
            localStorage.getItem(displayKey) || "[]"
        );

        response.replaceChildren();

        for (const item of saved) {
            const element = document.createElement(
                item.tag === "p" ? "p" : "div"
            );

            element.textContent = item.text;
            response.appendChild(element);
        }
    } catch (error) {
        console.error("Failed to restore chat:", error);
    }
}

async function sendToAI(message, history, onEvent) {
    const controller = new AbortController();
    window.aiController = controller;

    const apikey = document.getElementById("apikeyinput").value;

    if (message === "/settings") {
        document.getElementById("settingsoverlay").style.display = "flex";
        return;
    }

    loadsound.play()

    try {
        const response = await fetch(api + "chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apikey}`
            },
            body: JSON.stringify({
                message,
                sessionId,
                history,
                selection: localStorage.getItem("selectedAIModel") || "Default",
                level: Number(localStorage.getItem("selectedAILevel")) || 1,
                noswearing: localStorage.getItem("canswear") === "true"
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));

            throw new Error(
                data.error || `API error: ${response.status}`
            );
        }

        if (!response.body) {
            throw new Error("The server did not return a response stream.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = "";
        let result = "";

        function processLine(line) {
            if (!line.trim()) return;

            let event;

            try {
                event = JSON.parse(line);
            } catch (error) {
                console.error("Invalid server event:", error);
                return;
            }

            if (event.type === "middle") {
                result += event.chunk || "";
            }

            if (event.type === "error") {
                console.error("AI server error:", event.error);
            }

            if (typeof onEvent === "function") {
                onEvent(event, result);
            }
        }

        while (true) {
            const { value, done } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                processLine(line);
            }
        }

        buffer += decoder.decode();

        if (buffer.trim()) {
            processLine(buffer);
        }

        return result;
    } finally {
        if (window.aiController === controller) {
            window.aiController = null;
        }
        loadsound.pause()
    }
}

function stopAI(playsound = false) {
    if (playsound) {
        worksound.play()
    }
    window.aiController?.abort();
}

async function sendMessage(element) {
    const message = element.value.trim();

    if (!message) return;

    if (message === "/settings") {
        document.getElementById("settingsoverlay").style.display = "flex";
        element.value = "";
        return;
    }

    document.getElementById("chatbox").readOnly = true;
    document.getElementById("chatbox").value = "";
    document.getElementById("chatbox").setAttribute("placeholder", "AI responding...");
    document.getElementById("send").innerHTML = "■";
    document.documentElement.style.cursor = "wait";

    for (const element of document.querySelectorAll("*")) {
        element.style.cursor = "wait";
    }

    const previousHistory = chatHistory.slice();

    chatHistory.push({
        role: "user",
        content: message
    });

    const response = document.getElementById("response");

    const userParagraph = document.createElement("p");
    userParagraph.textContent = `You: ${message}`;
    response.appendChild(userParagraph);

    const paragraph = document.createElement("p");
    paragraph.textContent = "AI: ";
    response.appendChild(paragraph);

    saveChat();

    try {
        const answer = await sendToAI(
            message,
            previousHistory,
            event => {
                if (event.type === "middle") {
                    paragraph.appendChild(
                        document.createTextNode(event.chunk || "")
                    );

                    saveChat();
                } else if (event.type === "error") {
                    console.error("AI error:", event.error);
                }
            }
        );

        if (answer) {
            chatHistory.push({
                role: "assistant",
                content: answer
            });

            worksound.play()
        }

        saveChat();
    } catch (error) {
        if (error.name !== "AbortError") {
            console.error(error);
            paragraph.textContent = `Error: ${error.message}`;
            saveChat();
        } else {
            saveChat();
        }
    } finally {
        element.value = "";
        element.style.height = "20px";
        document.getElementById("chatbox").readOnly = false;
        document.getElementById("chatbox").setAttribute("placeholder", "Type anything...");
        document.documentElement.style.cursor = "";

        for (const element of document.querySelectorAll("*")) {
            element.style.cursor = "";
        }

        document.getElementById("send").innerHTML = "↑";
    }
}

async function clearSavedChat() {
    chatHistory = [];

    localStorage.removeItem(historyKey);
    localStorage.removeItem(displayKey);

    document.getElementById("response").replaceChildren();

    const apikey = document.getElementById("apikeyinput").value;

    try {
        const response = await fetch(api + "clear-chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apikey}`
            },
            body: JSON.stringify({ sessionId })
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));

            throw new Error(
                data.error || "Failed to clear server chat history."
            );
        } else {
            stopAI()
        }

        saveChat();
    } catch (error) {
        console.error("Failed to reset chat:", error);
    }
}

const apikeyinput = document.getElementById("apikeyinput");

apikeyinput.value = localStorage.getItem("apikey") || "";

apikeyinput.addEventListener("input", () => {
    localStorage.setItem("apikey", apikeyinput.value);
});

window.addEventListener("DOMContentLoaded", loadChat);

const levelSlider = document.getElementById("level");
const canswearcheckbox = document.getElementById("canswearcheckbox");

canswearcheckbox.checked = localStorage.getItem("canswear") === "true";

levelSlider.addEventListener("input", function() {
    updateAILevel(Number(levelSlider.value));
    confirmAILevel();
});

canswearcheckbox.addEventListener("input", function() {
    localStorage.setItem("canswear", String(canswearcheckbox.checked));
});

const input = document.getElementById("chatbox");
const typetext = new Audio("type.mp3")
const deltext = new Audio("typedel.mp3")

input.addEventListener("input", function(event) {
    if (event.inputType.includes("delete")) {
        deltext.currentTime = 0
        deltext.play()
    } else {
        typetext.currentTime = 0
        typetext.play()
    }
});

const chatbox = document.getElementById("chatbox");

let lastDelete = 0;
const deleteDelay = 75;

chatbox.addEventListener("keydown", function(event) {
    if (event.repeat && event.key !== "Backspace" && event.key !== "Delete") {
        event.preventDefault();
    }
});

chatbox.addEventListener("beforeinput", function(event) {
    if (event.inputType.includes("delete")) {
        const now = Date.now();

        if (now - lastDelete < deleteDelay) {
            event.preventDefault();
            return;
        }

        lastDelete = now;
    }
});

loadAILevel();

window.addEventListener("beforeunload", () => {
    stopAI();
});
