import React, { useState, useEffect } from "react";
import { w3cwebsocket as W3CWebSocket } from "websocket";

const ChatApp = () => {
    const [client, setClient] = useState(null);
    const [connectionStatus, setConnectionStatus] = useState("DISCONNECTED");
    const [inputValue, setInputValue] = useState("");

    const [conversationTree, setConversationTree] = useState({
        conversations: { root: [] },
        subConversations: {},
        activeConversationId: "root",
        lastMessageId: null,
    });
    const [displayConversationId, setDisplayConversationId] = useState("root");

    useEffect(() => {
        const client = new W3CWebSocket('ws://localhost:8000/ws/webgpt');

        client.onopen = () => {
            console.log('WebSocket Client Connected');
            setConnectionStatus("CONNECTED");
        };

        client.onerror = (error) => {
            console.log('Connection Error:', error);
            setConnectionStatus("ERROR");
        };

        client.onclose = (event) => {
            console.log('WebSocket Client Closed', event);
            setConnectionStatus("CLOSED");
        };

        client.onmessage = (message) => {
            console.log({ conversationTree, message })
            const data = JSON.parse(message.data);
            console.log({ data })
            switch (data.type) {
                case "start":
                    if (data.conversation_id) {
                        console.log("Starting new conversation: " + data.conversation_id);
                        setConversationTree(prevConversationTree => {
                            const { conversations, subConversations, activeConversationId, lastMessageId } = prevConversationTree;
                            const newConversation = conversations[activeConversationId] || [];
                            return {
                                conversations: { ...conversations, [data.conversation_id]: newConversation },
                                subConversations: { ...subConversations, [lastMessageId]: data.conversation_id },
                                activeConversationId: data.conversation_id,
                                lastMessageId: lastMessageId
                            };
                        });
                        //   setDisplayConversationId(data.conversation_id);
                        //   setActiveConversationId(data.conversation_id);
                        //   setConversations({...conversations, [data.conversation_id]: []});
                        //   setSubConversations({...subConversations, [lastMessageId]: data.conversation_id});
                    } else {
                        // we are starting to stream a message. 
                        // TODO
                        console.log("Starting to stream a message - not implemented", data);
                    }
                    break;
                case "end":
                    if (data.conversation_id) {
                        // set active conversation to parent conversation
                        setConversationTree(prevConversationTree => {
                            const { conversations, subConversations, activeConversationId, lastMessageId } = prevConversationTree;
                            const parent = Object.keys(subConversations).find(key => subConversations[key].includes(data.conversation_id));
                            return {
                                conversations: conversations,
                                subConversations: subConversations,
                                activeConversationId: parent,
                                lastMessageId: lastMessageId
                            };
                        });
                    } else {
                        // we are ending a stream of messages.
                        // TODO
                        console.log("Ending a stream of messages - not implemented", data);
                    }
                    break;
                default:
                    console.log("Adding to conv tree: " + message.data);
                    const { id } = data;
                    setConversationTree(prevConversationTree => {
                        const { conversations, subConversations, activeConversationId } = prevConversationTree;
                        const newConversation = conversations[activeConversationId] || [];
                        return {
                            conversations: { ...conversations, [activeConversationId]: [...newConversation, data] },
                            subConversations: subConversations,
                            activeConversationId: activeConversationId,
                            lastMessageId: id
                        };
                    });
            }
        };

        setClient(client);

        return () => {
            client.close();
        };
    }, []);

    // Function to handle when a message with a sub conversation is clicked
    const handleSubConversationClick = (messageId) => {
        const subConversationId = conversationTree.subConversations[messageId];
        if (subConversationId) {
            setDisplayConversationId(subConversationId);
        }
    };

    const sendMessage = () => {
        if (client.readyState !== client.OPEN) {
            console.error("Client is not connected");
            return;
        }

        const messagePayload = JSON.stringify({ query: inputValue, response_to: conversationTree.lastMessageId });
        client.send(messagePayload);
        setInputValue("");
    };

    if (connectionStatus !== "CONNECTED") {
        return (
            <div>
                WebSocket connection status: {connectionStatus}
            </div>
        )
    }

    return (
        <div>
            <div>
                {conversationTree.conversations[displayConversationId] && conversationTree.conversations[displayConversationId].map((message, index) =>
                    <div key={index} onClick={() => handleSubConversationClick(message.id)}>
                        <div>{message.role}: {message.content}</div>
                        {conversationTree.subConversations[message.id] && <div>Click to view sub conversation</div>}
                    </div>
                )}
            </div>
            <div>
                <textarea value={inputValue} onChange={e => setInputValue(e.target.value)}></textarea>
                <button onClick={sendMessage}>Send</button>
            </div>
        </div>
    );
};

export default ChatApp;
