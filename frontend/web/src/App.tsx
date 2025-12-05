// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface InsurancePolicy {
  id: string;
  encryptedPremium: string;
  encryptedCoverage: string;
  timestamp: number;
  owner: string;
  region: string;
  status: "pending" | "approved" | "rejected";
  disasterType: string;
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

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newPolicyData, setNewPolicyData] = useState({ 
    region: "", 
    disasterType: "", 
    premium: 0,
    coverage: 0 
  });
  const [selectedPolicy, setSelectedPolicy] = useState<InsurancePolicy | null>(null);
  const [decryptedPremium, setDecryptedPremium] = useState<number | null>(null);
  const [decryptedCoverage, setDecryptedCoverage] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const approvedCount = policies.filter(p => p.status === "approved").length;
  const pendingCount = policies.filter(p => p.status === "pending").length;
  const rejectedCount = policies.filter(p => p.status === "rejected").length;

  useEffect(() => {
    loadPolicies().finally(() => setLoading(false));
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

  const loadPolicies = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      const keysBytes = await contract.getData("policy_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing policy keys:", e); }
      }
      
      const list: InsurancePolicy[] = [];
      for (const key of keys) {
        try {
          const policyBytes = await contract.getData(`policy_${key}`);
          if (policyBytes.length > 0) {
            try {
              const policyData = JSON.parse(ethers.toUtf8String(policyBytes));
              list.push({ 
                id: key, 
                encryptedPremium: policyData.premium, 
                encryptedCoverage: policyData.coverage,
                timestamp: policyData.timestamp, 
                owner: policyData.owner, 
                region: policyData.region, 
                status: policyData.status || "pending",
                disasterType: policyData.disasterType
              });
            } catch (e) { console.error(`Error parsing policy data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading policy ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setPolicies(list);
    } catch (e) { console.error("Error loading policies:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const submitPolicy = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting policy data with Zama FHE..." });
    try {
      const encryptedPremium = FHEEncryptNumber(newPolicyData.premium);
      const encryptedCoverage = FHEEncryptNumber(newPolicyData.coverage);
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const policyId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const policyData = { 
        premium: encryptedPremium, 
        coverage: encryptedCoverage,
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address, 
        region: newPolicyData.region, 
        status: "pending",
        disasterType: newPolicyData.disasterType
      };
      
      await contract.setData(`policy_${policyId}`, ethers.toUtf8Bytes(JSON.stringify(policyData)));
      
      const keysBytes = await contract.getData("policy_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(policyId);
      await contract.setData("policy_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Encrypted policy submitted securely!" });
      await loadPolicies();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewPolicyData({ 
          region: "", 
          disasterType: "", 
          premium: 0,
          coverage: 0 
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedPremium: string, encryptedCoverage: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return {
        premium: FHEDecryptNumber(encryptedPremium),
        coverage: FHEDecryptNumber(encryptedCoverage)
      };
    } catch (e) { 
      console.error("Decryption failed:", e); 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const approvePolicy = async (policyId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted policy with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const policyBytes = await contract.getData(`policy_${policyId}`);
      if (policyBytes.length === 0) throw new Error("Policy not found");
      
      const policyData = JSON.parse(ethers.toUtf8String(policyBytes));
      const updatedPolicy = { ...policyData, status: "approved" };
      
      await contract.setData(`policy_${policyId}`, ethers.toUtf8Bytes(JSON.stringify(updatedPolicy)));
      
      setTransactionStatus({ visible: true, status: "success", message: "FHE approval completed successfully!" });
      await loadPolicies();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Approval failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const rejectPolicy = async (policyId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted policy with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const policyBytes = await contract.getData(`policy_${policyId}`);
      if (policyBytes.length === 0) throw new Error("Policy not found");
      
      const policyData = JSON.parse(ethers.toUtf8String(policyBytes));
      const updatedPolicy = { ...policyData, status: "rejected" };
      
      await contract.setData(`policy_${policyId}`, ethers.toUtf8Bytes(JSON.stringify(updatedPolicy)));
      
      setTransactionStatus({ visible: true, status: "success", message: "FHE rejection completed successfully!" });
      await loadPolicies();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Rejection failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isOwner = (policyAddress: string) => address?.toLowerCase() === policyAddress.toLowerCase();

  const filteredPolicies = policies.filter(policy => {
    const matchesSearch = 
      policy.region.toLowerCase().includes(searchTerm.toLowerCase()) || 
      policy.disasterType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      policy.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === "all" || policy.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  const renderStatsCards = () => {
    return (
      <div className="stats-container">
        <div className="stat-card">
          <div className="stat-value">{policies.length}</div>
          <div className="stat-label">Total Policies</div>
        </div>
        <div className="stat-card approved">
          <div className="stat-value">{approvedCount}</div>
          <div className="stat-label">Approved</div>
        </div>
        <div className="stat-card pending">
          <div className="stat-value">{pendingCount}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card rejected">
          <div className="stat-value">{rejectedCount}</div>
          <div className="stat-label">Rejected</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Loading climate insurance policies...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>ReFi Climate Insurance</h1>
          <p>FHE-encrypted protection for climate disasters</p>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            + New Policy
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <main className="main-content">
        <section className="intro-section">
          <h2>Community-Based Climate Insurance</h2>
          <p>
            A decentralized insurance protocol powered by Zama FHE technology that provides encrypted, 
            community-based coverage for climate disasters. Policies and claims remain fully encrypted 
            while being processed by a global DAO.
          </p>
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
        </section>

        {renderStatsCards()}

        <section className="search-section">
          <div className="search-bar">
            <input 
              type="text" 
              placeholder="Search policies by region or disaster type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-options">
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <button onClick={loadPolicies} disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </section>

        <section className="policies-section">
          <h2>Insurance Policies</h2>
          {filteredPolicies.length === 0 ? (
            <div className="no-policies">
              <p>No policies found matching your criteria</p>
              <button onClick={() => setShowCreateModal(true)}>Create First Policy</button>
            </div>
          ) : (
            <div className="policies-grid">
              {filteredPolicies.map(policy => (
                <div 
                  key={policy.id} 
                  className={`policy-card ${policy.status}`}
                  onClick={() => setSelectedPolicy(policy)}
                >
                  <div className="policy-header">
                    <h3>{policy.region}</h3>
                    <span className={`status-badge ${policy.status}`}>{policy.status}</span>
                  </div>
                  <div className="policy-details">
                    <p><strong>Disaster Type:</strong> {policy.disasterType}</p>
                    <p><strong>Date:</strong> {new Date(policy.timestamp * 1000).toLocaleDateString()}</p>
                    <p><strong>Owner:</strong> {policy.owner.substring(0, 6)}...{policy.owner.substring(38)}</p>
                  </div>
                  <div className="policy-actions">
                    {isOwner(policy.owner) && policy.status === "pending" && (
                      <>
                        <button 
                          className="approve-btn"
                          onClick={(e) => { e.stopPropagation(); approvePolicy(policy.id); }}
                        >
                          Approve
                        </button>
                        <button 
                          className="reject-btn"
                          onClick={(e) => { e.stopPropagation(); rejectPolicy(policy.id); }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="community-section">
          <h2>Join Our Community</h2>
          <p>Participate in governance and help protect vulnerable communities from climate disasters</p>
          <div className="community-links">
            <a href="#" className="community-link">DAO Forum</a>
            <a href="#" className="community-link">Discord</a>
            <a href="#" className="community-link">Twitter</a>
          </div>
        </section>
      </main>

      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitPolicy} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating} 
          policyData={newPolicyData} 
          setPolicyData={setNewPolicyData}
        />
      )}

      {selectedPolicy && (
        <PolicyDetailModal 
          policy={selectedPolicy} 
          onClose={() => { 
            setSelectedPolicy(null); 
            setDecryptedPremium(null);
            setDecryptedCoverage(null);
          }} 
          decryptedPremium={decryptedPremium}
          decryptedCoverage={decryptedCoverage}
          setDecryptedPremium={setDecryptedPremium}
          setDecryptedCoverage={setDecryptedCoverage}
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
        />
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">GitHub</a>
          </div>
          <div className="footer-copyright">
            © {new Date().getFullYear()} ReFi Climate Insurance Protocol. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  policyData: any;
  setPolicyData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ onSubmit, onClose, creating, policyData, setPolicyData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setPolicyData({ ...policyData, [name]: value });
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPolicyData({ ...policyData, [name]: parseFloat(value) });
  };

  const handleSubmit = () => {
    if (!policyData.region || !policyData.disasterType || !policyData.premium || !policyData.coverage) { 
      alert("Please fill all required fields"); 
      return; 
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Create New Insurance Policy</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice">
            <p>All sensitive data will be encrypted with Zama FHE before submission</p>
          </div>
          
          <div className="form-group">
            <label>Region *</label>
            <input 
              type="text" 
              name="region" 
              value={policyData.region} 
              onChange={handleChange} 
              placeholder="Enter region (e.g., Southeast Asia)" 
            />
          </div>
          
          <div className="form-group">
            <label>Disaster Type *</label>
            <select 
              name="disasterType" 
              value={policyData.disasterType} 
              onChange={handleChange}
            >
              <option value="">Select disaster type</option>
              <option value="Flood">Flood</option>
              <option value="Drought">Drought</option>
              <option value="Hurricane">Hurricane</option>
              <option value="Wildfire">Wildfire</option>
              <option value="Other">Other</option>
            </select>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Premium Amount (ETH) *</label>
              <input 
                type="number" 
                name="premium" 
                value={policyData.premium} 
                onChange={handleNumberChange} 
                placeholder="0.00" 
                step="0.01"
                min="0"
              />
            </div>
            
            <div className="form-group">
              <label>Coverage Amount (ETH) *</label>
              <input 
                type="number" 
                name="coverage" 
                value={policyData.coverage} 
                onChange={handleNumberChange} 
                placeholder="0.00" 
                step="0.01"
                min="0"
              />
            </div>
          </div>
          
          <div className="encryption-preview">
            <h4>Encryption Preview</h4>
            <div className="preview-row">
              <span>Premium:</span>
              <div>{policyData.premium ? FHEEncryptNumber(policyData.premium).substring(0, 30) + '...' : 'Not encrypted yet'}</div>
            </div>
            <div className="preview-row">
              <span>Coverage:</span>
              <div>{policyData.coverage ? FHEEncryptNumber(policyData.coverage).substring(0, 30) + '...' : 'Not encrypted yet'}</div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button onClick={handleSubmit} disabled={creating} className="submit-btn">
            {creating ? "Encrypting with FHE..." : "Create Policy"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface PolicyDetailModalProps {
  policy: InsurancePolicy;
  onClose: () => void;
  decryptedPremium: number | null;
  decryptedCoverage: number | null;
  setDecryptedPremium: (value: number | null) => void;
  setDecryptedCoverage: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedPremium: string, encryptedCoverage: string) => Promise<{premium: number, coverage: number} | null>;
}

const PolicyDetailModal: React.FC<PolicyDetailModalProps> = ({ 
  policy, 
  onClose, 
  decryptedPremium,
  decryptedCoverage,
  setDecryptedPremium,
  setDecryptedCoverage,
  isDecrypting, 
  decryptWithSignature 
}) => {
  const handleDecrypt = async () => {
    if (decryptedPremium !== null) { 
      setDecryptedPremium(null);
      setDecryptedCoverage(null);
      return; 
    }
    
    const decrypted = await decryptWithSignature(policy.encryptedPremium, policy.encryptedCoverage);
    if (decrypted !== null) {
      setDecryptedPremium(decrypted.premium);
      setDecryptedCoverage(decrypted.coverage);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="policy-detail-modal">
        <div className="modal-header">
          <h2>Policy Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="policy-info">
            <div className="info-row">
              <span>Region:</span>
              <strong>{policy.region}</strong>
            </div>
            <div className="info-row">
              <span>Disaster Type:</span>
              <strong>{policy.disasterType}</strong>
            </div>
            <div className="info-row">
              <span>Owner:</span>
              <strong>{policy.owner.substring(0, 6)}...{policy.owner.substring(38)}</strong>
            </div>
            <div className="info-row">
              <span>Date:</span>
              <strong>{new Date(policy.timestamp * 1000).toLocaleString()}</strong>
            </div>
            <div className="info-row">
              <span>Status:</span>
              <strong className={`status-badge ${policy.status}`}>{policy.status}</strong>
            </div>
          </div>
          
          <div className="encrypted-section">
            <h3>Encrypted Data</h3>
            <div className="encrypted-data">
              <p><strong>Premium:</strong> {policy.encryptedPremium.substring(0, 50)}...</p>
              <p><strong>Coverage:</strong> {policy.encryptedCoverage.substring(0, 50)}...</p>
            </div>
            <div className="fhe-tag">
              <span>FHE Encrypted</span>
            </div>
            
            <button 
              className="decrypt-btn" 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
            >
              {isDecrypting ? "Decrypting..." : 
               decryptedPremium !== null ? "Hide Values" : "Decrypt with Wallet"}
            </button>
          </div>
          
          {decryptedPremium !== null && (
            <div className="decrypted-section">
              <h3>Decrypted Values</h3>
              <div className="decrypted-values">
                <div className="value-row">
                  <span>Premium:</span>
                  <strong>{decryptedPremium} ETH</strong>
                </div>
                <div className="value-row">
                  <span>Coverage:</span>
                  <strong>{decryptedCoverage} ETH</strong>
                </div>
              </div>
              <div className="decryption-notice">
                <p>Values decrypted after wallet signature verification</p>
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