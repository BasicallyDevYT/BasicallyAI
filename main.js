
let showPopup = false;
const api = "https://unmalicious-feverish-delora.ngrok-free.dev/"

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
    const canoverwrite = confirm("The saved chat will be PERMANENTLY deleted, Continue?")

    if (canoverwrite) {
        clearSavedChat()
    }
}

function asksave(option) {
    const canoverwrite = confirm("Changing this option is gonna clear the currently saved chat, Continue?")

    if (canoverwrite) {
        setselectedaimodel(option);
        clearSavedChat()
    } else {
        const select = document.getElementById("model");
        const savedModel = localStorage.getItem("selectedAIModel");
        select.value = savedModel
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
    setselectedaimodel("llama3.2:3b")
}

window.addEventListener("DOMContentLoaded", loadselectedaimodel);

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

    const apikey = document.getElementById("apikeyinput").value

    if (message === "/settings") {
        document.getElementById("settingsoverlay").style.display = "flex"
        return
    }

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
                model: localStorage.getItem("selectedAIModel") || "llama3.2:3b",
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
    }
}

function stopAI() {
    window.aiController?.abort();
}

async function sendMessage(element) {
    const message = element.value.trim();

    if (!message) return;

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

    saveChat();

    const paragraph = document.createElement("p");
    document.getElementById("response").appendChild(paragraph);
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

        chatHistory.push({
            role: "assistant",
            content: answer
        });

        saveChat();
    } catch (error) {
        if (error.name !== "AbortError") {
            console.error(error);

            paragraph.appendChild(
                document.createTextNode(` Error: ${error.message}`)
            );

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

    const apikey = document.getElementById("apikeyinput").value

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
            throw new Error("Failed to clear server chat history.");
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

window.addEventListener("beforeunload", () => {
    stopAI();
});
