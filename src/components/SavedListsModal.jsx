import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";

export default function SavedListsModal({ onClose, onLoadList, currentEntries, currentTheme }) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { currentUser } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [saveName, setSaveName] = useState(currentTheme || "");

  useEffect(() => {
    if (currentUser) {
      fetchLists();
    }
  }, [currentUser]);

  async function fetchLists() {
    try {
      const q = query(collection(db, "wordLists"), where("userId", "==", currentUser.uid));
      const querySnapshot = await getDocs(q);
      const fetchedLists = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
      setLists(fetchedLists);
    } catch (err) {
      console.error(err);
      setError("Failed to load lists.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!currentEntries || currentEntries.length === 0) return;
    
    setIsSaving(true);
    try {
      await addDoc(collection(db, "wordLists"), {
        userId: currentUser.uid,
        name: saveName || "Untitled List",
        entries: currentEntries,
        createdAt: serverTimestamp(),
        wordCount: currentEntries.length
      });
      setSaveName("");
      fetchLists();
    } catch (err) {
      setError("Failed to save list.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Are you sure you want to delete this list?")) return;
    try {
      await deleteDoc(doc(db, "wordLists", id));
      setLists(lists.filter(list => list.id !== id));
    } catch (err) {
      setError("Failed to delete list.");
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2>Saved Word Lists</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        
        {error && <div className="error-alert">{error}</div>}

        <div className="save-section">
          <h3>Save Current List</h3>
          <div className="save-controls">
            <input 
              type="text" 
              placeholder="List Name (e.g. Summer Theme)" 
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
            />
            <button 
              className="btn btn-primary" 
              onClick={handleSave} 
              disabled={isSaving || !currentEntries?.length}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
          {!currentEntries?.length && <p className="hint">No words to save currently.</p>}
        </div>

        <div className="lists-section">
          <h3>Your Lists</h3>
          {loading ? (
            <p>Loading...</p>
          ) : lists.length === 0 ? (
            <p className="text-muted">No saved lists yet.</p>
          ) : (
            <ul className="saved-lists">
              {lists.map(list => (
                <li key={list.id} className="saved-list-item">
                  <div className="list-info">
                    <strong>{list.name}</strong>
                    <span className="list-meta">{list.wordCount} words • {new Date(list.createdAt?.seconds * 1000).toLocaleDateString()}</span>
                  </div>
                  <div className="list-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => { onLoadList(list.entries); onClose(); }}>Load</button>
                    <button className="btn btn-tertiary btn-sm" onClick={() => handleDelete(list.id)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
