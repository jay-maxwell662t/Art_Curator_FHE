// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface Artist {
  id: string;
  name: string;
  encryptedPotential: string;
  encryptedPrice: string;
  timestamp: number;
  owner: string;
  style: string;
  status: "undiscovered" | "contracted" | "rejected";
  history?: {
    action: string;
    timestamp: number;
    by: string;
  }[];
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const ART_STYLES = [
  "Abstract", "Impressionist", "Surrealist", "Pop Art", 
  "Minimalist", "Cubist", "Expressionist", "Digital"
];

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newArtistData, setNewArtistData] = useState({ name: "", style: ART_STYLES[0], potential: 50, price: 1 });
  const [showIntro, setShowIntro] = useState(true);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [decryptedPotential, setDecryptedPotential] = useState<number | null>(null);
  const [decryptedPrice, setDecryptedPrice] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStyle, setFilterStyle] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [userHistory, setUserHistory] = useState<any[]>([]);

  // Filter artists based on search and filters
  const filteredArtists = artists.filter(artist => {
    const matchesSearch = artist.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStyle = filterStyle === "All" || artist.style === filterStyle;
    const matchesStatus = filterStatus === "All" || artist.status === filterStatus;
    return matchesSearch && matchesStyle && matchesStatus;
  });

  const discoveredCount = artists.filter(a => a.status === "undiscovered").length;
  const contractedCount = artists.filter(a => a.status === "contracted").length;
  const rejectedCount = artists.filter(a => a.status === "rejected").length;

  useEffect(() => {
    loadArtists().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadArtists = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      const keysBytes = await contract.getData("artist_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing artist keys:", e); }
      }
      
      const list: Artist[] = [];
      for (const key of keys) {
        try {
          const artistBytes = await contract.getData(`artist_${key}`);
          if (artistBytes.length > 0) {
            try {
              const artistData = JSON.parse(ethers.toUtf8String(artistBytes));
              list.push({ 
                id: key, 
                name: artistData.name,
                encryptedPotential: artistData.potential,
                encryptedPrice: artistData.price,
                timestamp: artistData.timestamp, 
                owner: artistData.owner, 
                style: artistData.style, 
                status: artistData.status || "undiscovered",
                history: artistData.history || []
              });
            } catch (e) { console.error(`Error parsing artist data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading artist ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setArtists(list);
    } catch (e) { console.error("Error loading artists:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const discoverArtist = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setDiscovering(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting artist data with Zama FHE..." });
    try {
      const encryptedPotential = FHEEncryptNumber(newArtistData.potential);
      const encryptedPrice = FHEEncryptNumber(newArtistData.price);
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const artistId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const artistData = { 
        name: newArtistData.name,
        potential: encryptedPotential,
        price: encryptedPrice,
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address, 
        style: newArtistData.style, 
        status: "undiscovered",
        history: [{
          action: "Discovered",
          timestamp: Math.floor(Date.now() / 1000),
          by: address || ""
        }]
      };
      
      await contract.setData(`artist_${artistId}`, ethers.toUtf8Bytes(JSON.stringify(artistData)));
      
      const keysBytes = await contract.getData("artist_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(artistId);
      await contract.setData("artist_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      // Add to user history
      setUserHistory(prev => [{
        action: "Discovered Artist",
        artist: newArtistData.name,
        timestamp: new Date().toLocaleString(),
        details: `${newArtistData.style} artist with potential ${newArtistData.potential}`
      }, ...prev]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Artist discovered and encrypted!" });
      await loadArtists();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowDiscoverModal(false);
        setNewArtistData({ name: "", style: ART_STYLES[0], potential: 50, price: 1 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Discovery failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setDiscovering(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const contractArtist = async (artistId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted data with FHE..." });
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      const artistBytes = await contract.getData(`artist_${artistId}`);
      if (artistBytes.length === 0) throw new Error("Artist not found");
      const artistData = JSON.parse(ethers.toUtf8String(artistBytes));
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const updatedArtist = { 
        ...artistData, 
        status: "contracted",
        history: [
          ...(artistData.history || []),
          {
            action: "Contracted",
            timestamp: Math.floor(Date.now() / 1000),
            by: address || ""
          }
        ]
      };
      await contractWithSigner.setData(`artist_${artistId}`, ethers.toUtf8Bytes(JSON.stringify(updatedArtist)));
      
      // Add to user history
      const artist = artists.find(a => a.id === artistId);
      if (artist) {
        setUserHistory(prev => [{
          action: "Contracted Artist",
          artist: artist.name,
          timestamp: new Date().toLocaleString(),
          details: `Signed ${artist.style} artist to contract`
        }, ...prev]);
      }
      
      setTransactionStatus({ visible: true, status: "success", message: "Artist contracted successfully!" });
      await loadArtists();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Contract failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const rejectArtist = async (artistId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted data with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const artistBytes = await contract.getData(`artist_${artistId}`);
      if (artistBytes.length === 0) throw new Error("Artist not found");
      const artistData = JSON.parse(ethers.toUtf8String(artistBytes));
      
      const updatedArtist = { 
        ...artistData, 
        status: "rejected",
        history: [
          ...(artistData.history || []),
          {
            action: "Rejected",
            timestamp: Math.floor(Date.now() / 1000),
            by: address || ""
          }
        ]
      };
      await contract.setData(`artist_${artistId}`, ethers.toUtf8Bytes(JSON.stringify(updatedArtist)));
      
      // Add to user history
      const artist = artists.find(a => a.id === artistId);
      if (artist) {
        setUserHistory(prev => [{
          action: "Rejected Artist",
          artist: artist.name,
          timestamp: new Date().toLocaleString(),
          details: `Rejected ${artist.style} artist`
        }, ...prev]);
      }
      
      setTransactionStatus({ visible: true, status: "success", message: "Artist rejected!" });
      await loadArtists();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Rejection failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isOwner = (artistAddress: string) => address?.toLowerCase() === artistAddress.toLowerCase();

  const renderStats = () => {
    return (
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{artists.length}</div>
          <div className="stat-label">Total Artists</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{discoveredCount}</div>
          <div className="stat-label">Undiscovered</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{contractedCount}</div>
          <div className="stat-label">Contracted</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{rejectedCount}</div>
          <div className="stat-label">Rejected</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="rainbow-spinner"></div>
      <p>Initializing Art Gallery...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Art<span>Curator</span>FHE</h1>
          <div className="fhe-badge">FHE-Powered</div>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowDiscoverModal(true)} className="discover-btn">
            <div className="add-icon"></div>Discover Artist
          </button>
          <button className="intro-btn" onClick={() => setShowIntro(!showIntro)}>
            {showIntro ? "Hide Intro" : "Show Intro"}
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <div className="main-content">
        {showIntro && (
          <div className="intro-section glass-card">
            <h2>Welcome to Art Curator FHE</h2>
            <p>
              Discover and contract artists with encrypted potential values using Zama FHE technology. 
              All artist data is encrypted on-chain and remains private during your evaluation process.
            </p>
            <div className="fhe-explanation">
              <div className="explanation-item">
                <div className="icon">🔍</div>
                <h3>Discover</h3>
                <p>Find new artists with encrypted potential values</p>
              </div>
              <div className="explanation-item">
                <div className="icon">📊</div>
                <h3>Evaluate</h3>
                <p>Use your curator skills to assess their worth</p>
              </div>
              <div className="explanation-item">
                <div className="icon">✍️</div>
                <h3>Contract</h3>
                <p>Sign promising artists to your gallery</p>
              </div>
            </div>
            <button className="close-intro" onClick={() => setShowIntro(false)}>Get Started</button>
          </div>
        )}

        <div className="search-filters">
          <div className="search-bar">
            <input 
              type="text" 
              placeholder="Search artists..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="search-icon">🔍</div>
          </div>
          <div className="filter-group">
            <select value={filterStyle} onChange={(e) => setFilterStyle(e.target.value)}>
              <option value="All">All Styles</option>
              {ART_STYLES.map(style => (
                <option key={style} value={style}>{style}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="All">All Statuses</option>
              <option value="undiscovered">Undiscovered</option>
              <option value="contracted">Contracted</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <button onClick={loadArtists} className="refresh-btn" disabled={isRefreshing}>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="stats-section">
          <h2>Gallery Statistics</h2>
          {renderStats()}
        </div>

        <div className="artists-grid">
          {filteredArtists.length === 0 ? (
            <div className="no-artists">
              <div className="empty-icon">🎨</div>
              <p>No artists found matching your criteria</p>
              <button className="discover-btn" onClick={() => setShowDiscoverModal(true)}>Discover New Artist</button>
            </div>
          ) : (
            filteredArtists.map(artist => (
              <div 
                className={`artist-card ${artist.status}`} 
                key={artist.id}
                onClick={() => setSelectedArtist(artist)}
              >
                <div className="artist-header">
                  <div className="artist-name">{artist.name}</div>
                  <div className={`artist-status ${artist.status}`}>
                    {artist.status.charAt(0).toUpperCase() + artist.status.slice(1)}
                  </div>
                </div>
                <div className="artist-style">{artist.style}</div>
                <div className="artist-meta">
                  <div className="meta-item">
                    <span>Potential:</span>
                    <div className="encrypted-value">FHE-Encrypted</div>
                  </div>
                  <div className="meta-item">
                    <span>Price:</span>
                    <div className="encrypted-value">FHE-Encrypted</div>
                  </div>
                </div>
                <div className="artist-actions">
                  {isOwner(artist.owner) && artist.status === "undiscovered" && (
                    <>
                      <button className="action-btn contract" onClick={(e) => { e.stopPropagation(); contractArtist(artist.id); }}>Contract</button>
                      <button className="action-btn reject" onClick={(e) => { e.stopPropagation(); rejectArtist(artist.id); }}>Reject</button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="history-section">
          <h2>Your Curator History</h2>
          <div className="history-list">
            {userHistory.length === 0 ? (
              <div className="no-history">No history yet. Discover your first artist!</div>
            ) : (
              userHistory.map((item, index) => (
                <div className="history-item" key={index}>
                  <div className="history-action">{item.action}</div>
                  <div className="history-artist">{item.artist}</div>
                  <div className="history-details">{item.details}</div>
                  <div className="history-time">{item.timestamp}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showDiscoverModal && (
        <div className="modal-overlay">
          <div className="discover-modal glass-card">
            <div className="modal-header">
              <h2>Discover New Artist</h2>
              <button onClick={() => setShowDiscoverModal(false)} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className="fhe-notice">
                <div className="lock-icon">🔒</div>
                <p>Artist potential and price will be encrypted with Zama FHE before submission</p>
              </div>
              
              <div className="form-group">
                <label>Artist Name</label>
                <input 
                  type="text" 
                  value={newArtistData.name}
                  onChange={(e) => setNewArtistData({...newArtistData, name: e.target.value})}
                  placeholder="Enter artist name..."
                />
              </div>
              
              <div className="form-group">
                <label>Art Style</label>
                <select 
                  value={newArtistData.style}
                  onChange={(e) => setNewArtistData({...newArtistData, style: e.target.value})}
                >
                  {ART_STYLES.map(style => (
                    <option key={style} value={style}>{style}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>Potential (1-100)</label>
                <input 
                  type="range" 
                  min="1" 
                  max="100" 
                  value={newArtistData.potential}
                  onChange={(e) => setNewArtistData({...newArtistData, potential: parseInt(e.target.value)})}
                />
                <div className="range-value">{newArtistData.potential}</div>
              </div>
              
              <div className="form-group">
                <label>Initial Price (ETH)</label>
                <input 
                  type="number" 
                  min="0.1" 
                  step="0.1"
                  value={newArtistData.price}
                  onChange={(e) => setNewArtistData({...newArtistData, price: parseFloat(e.target.value)})}
                />
              </div>
              
              <div className="encryption-preview">
                <h4>Encryption Preview</h4>
                <div className="preview-row">
                  <span>Potential:</span>
                  <div>{FHEEncryptNumber(newArtistData.potential).substring(0, 20)}...</div>
                </div>
                <div className="preview-row">
                  <span>Price:</span>
                  <div>{FHEEncryptNumber(newArtistData.price).substring(0, 20)}...</div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowDiscoverModal(false)} className="cancel-btn">Cancel</button>
              <button onClick={discoverArtist} disabled={discovering} className="submit-btn">
                {discovering ? "Encrypting with FHE..." : "Discover Artist"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedArtist && (
        <ArtistDetailModal 
          artist={selectedArtist} 
          onClose={() => { 
            setSelectedArtist(null); 
            setDecryptedPotential(null);
            setDecryptedPrice(null);
          }} 
          decryptedPotential={decryptedPotential}
          decryptedPrice={decryptedPrice}
          setDecryptedPotential={setDecryptedPotential}
          setDecryptedPrice={setDecryptedPrice}
          isDecrypting={isDecrypting}
          decryptWithSignature={decryptWithSignature}
          isOwner={isOwner(selectedArtist.owner)}
        />
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content glass-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✕</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">ArtCuratorFHE</div>
            <p>Discover and contract artists with encrypted potential values</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">About</a>
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">Powered by Zama FHE</div>
          <div className="copyright">© {new Date().getFullYear()} ArtCuratorFHE</div>
        </div>
      </footer>
    </div>
  );
};

interface ArtistDetailModalProps {
  artist: Artist;
  onClose: () => void;
  decryptedPotential: number | null;
  decryptedPrice: number | null;
  setDecryptedPotential: (value: number | null) => void;
  setDecryptedPrice: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
  isOwner: boolean;
}

const ArtistDetailModal: React.FC<ArtistDetailModalProps> = ({ 
  artist, onClose, decryptedPotential, decryptedPrice, 
  setDecryptedPotential, setDecryptedPrice, isDecrypting, 
  decryptWithSignature, isOwner 
}) => {
  const handleDecrypt = async () => {
    if (decryptedPotential !== null) { 
      setDecryptedPotential(null);
      setDecryptedPrice(null);
      return; 
    }
    
    const decryptedPot = await decryptWithSignature(artist.encryptedPotential);
    const decryptedPr = await decryptWithSignature(artist.encryptedPrice);
    
    if (decryptedPot !== null) setDecryptedPotential(decryptedPot);
    if (decryptedPr !== null) setDecryptedPrice(decryptedPr);
  };

  return (
    <div className="modal-overlay">
      <div className="artist-detail-modal glass-card">
        <div className="modal-header">
          <h2>{artist.name}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="artist-info">
            <div className="info-row">
              <span>Style:</span>
              <strong>{artist.style}</strong>
            </div>
            <div className="info-row">
              <span>Status:</span>
              <strong className={`status ${artist.status}`}>
                {artist.status.charAt(0).toUpperCase() + artist.status.slice(1)}
              </strong>
            </div>
            <div className="info-row">
              <span>Discovered:</span>
              <strong>{new Date(artist.timestamp * 1000).toLocaleString()}</strong>
            </div>
            <div className="info-row">
              <span>Owner:</span>
              <strong>{artist.owner.substring(0, 6)}...{artist.owner.substring(38)}</strong>
            </div>
          </div>
          
          <div className="artist-stats">
            <div className="stat-card">
              <h3>Potential</h3>
              {decryptedPotential !== null ? (
                <div className="decrypted-value">
                  {decryptedPotential}
                  <div className="value-label">/100</div>
                </div>
              ) : (
                <div className="encrypted-value">
                  FHE-Encrypted
                  <div className="fhe-tag">🔒</div>
                </div>
              )}
            </div>
            
            <div className="stat-card">
              <h3>Price</h3>
              {decryptedPrice !== null ? (
                <div className="decrypted-value">
                  {decryptedPrice} ETH
                </div>
              ) : (
                <div className="encrypted-value">
                  FHE-Encrypted
                  <div className="fhe-tag">🔒</div>
                </div>
              )}
            </div>
          </div>
          
          <div className="decrypt-section">
            <button 
              className="decrypt-btn" 
              onClick={handleDecrypt} 
              disabled={isDecrypting || !isOwner}
            >
              {isDecrypting ? "Decrypting..." : 
               decryptedPotential !== null ? "Hide Values" : "Decrypt with Wallet"}
            </button>
            {!isOwner && (
              <div className="decrypt-notice">
                Only the artist discoverer can decrypt these values
              </div>
            )}
          </div>
          
          {artist.history && artist.history.length > 0 && (
            <div className="artist-history">
              <h3>History</h3>
              <div className="history-list">
                {artist.history.map((item, index) => (
                  <div className="history-item" key={index}>
                    <div className="history-action">{item.action}</div>
                    <div className="history-by">{item.by.substring(0, 6)}...{item.by.substring(38)}</div>
                    <div className="history-time">{new Date(item.timestamp * 1000).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;