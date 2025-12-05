pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ReFiClimateInsuranceFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchNotOpen();
    error BatchClosed();
    error InvalidParameter();
    error ReplayDetected();
    error StateMismatch();
    error InvalidProof();
    error NotInitialized();

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;

    struct Policy {
        euint32 encryptedCoverageAmount;
        euint32 encryptedRiskFactor;
        euint32 encryptedPremium;
    }

    struct Claim {
        euint32 encryptedClaimAmount;
        euint32 encryptedPolicyId;
    }

    struct Batch {
        uint256 id;
        uint256 totalEncryptedCoverage;
        uint256 totalEncryptedPremiums;
        uint256 totalEncryptedClaims;
        bool open;
    }

    Batch[] public batches;
    mapping(uint256 => Policy[]) public batchPolicies;
    mapping(uint256 => Claim[]) public batchClaims;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event PauseToggled(bool paused);
    event CooldownSet(uint256 oldCooldown, uint256 newCooldown);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event PolicySubmitted(address indexed provider, uint256 indexed batchId, uint256 policyIndex);
    event ClaimSubmitted(address indexed provider, uint256 indexed batchId, uint256 claimIndex);
    event DecryptionRequested(uint256 indexed requestId, uint256 batchId, bytes32 stateHash);
    event DecryptionCompleted(uint256 indexed requestId, uint256 batchId, uint256 totalCoverage, uint256 totalPremiums, uint256 totalClaims);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier respectCooldown(address _address, mapping(address => uint256) storage _lastActionTime) {
        if (block.timestamp < _lastActionTime[_address] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[msg.sender] = true;
        cooldownSeconds = 60; // Default cooldown: 60 seconds
        batches.push(); // Initialize batch array with dummy Batch 0
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        delete isProvider[provider];
        emit ProviderRemoved(provider);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseToggled(_paused);
    }

    function setCooldown(uint256 newCooldownSeconds) external onlyOwner {
        if (newCooldownSeconds == 0) revert InvalidParameter();
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSet(oldCooldown, newCooldownSeconds);
    }

    function openBatch() external onlyOwner whenNotPaused {
        Batch memory newBatch = Batch({
            id: batches.length,
            totalEncryptedCoverage: 0, // Placeholder, will be encrypted
            totalEncryptedPremiums: 0, // Placeholder, will be encrypted
            totalEncryptedClaims: 0,   // Placeholder, will be encrypted
            open: true
        });
        batches.push(newBatch);
        emit BatchOpened(newBatch.id);
    }

    function closeBatch(uint256 batchId) external onlyOwner whenNotPaused {
        if (batchId >= batches.length) revert BatchNotOpen();
        Batch storage batch = batches[batchId];
        if (!batch.open) revert BatchClosed();
        batch.open = false;
        emit BatchClosed(batchId);
    }

    function submitPolicy(
        uint256 batchId,
        euint32 encryptedCoverageAmount,
        euint32 encryptedRiskFactor,
        euint32 encryptedPremium
    ) external onlyProvider whenNotPaused respectCooldown(msg.sender, lastSubmissionTime) {
        if (batchId >= batches.length) revert BatchNotOpen();
        Batch storage batch = batches[batchId];
        if (!batch.open) revert BatchClosed();

        _initIfNeeded(encryptedCoverageAmount);
        _initIfNeeded(encryptedRiskFactor);
        _initIfNeeded(encryptedPremium);

        batchPolicies[batchId].push(Policy({
            encryptedCoverageAmount: encryptedCoverageAmount,
            encryptedRiskFactor: encryptedRiskFactor,
            encryptedPremium: encryptedPremium
        }));

        lastSubmissionTime[msg.sender] = block.timestamp;
        emit PolicySubmitted(msg.sender, batchId, batchPolicies[batchId].length - 1);
    }

    function submitClaim(
        uint256 batchId,
        euint32 encryptedClaimAmount,
        euint32 encryptedPolicyId
    ) external onlyProvider whenNotPaused respectCooldown(msg.sender, lastSubmissionTime) {
        if (batchId >= batches.length) revert BatchNotOpen();
        Batch storage batch = batches[batchId];
        if (!batch.open) revert BatchClosed();

        _initIfNeeded(encryptedClaimAmount);
        _initIfNeeded(encryptedPolicyId);

        batchClaims[batchId].push(Claim({
            encryptedClaimAmount: encryptedClaimAmount,
            encryptedPolicyId: encryptedPolicyId
        }));

        lastSubmissionTime[msg.sender] = block.timestamp;
        emit ClaimSubmitted(msg.sender, batchId, batchClaims[batchId].length - 1);
    }

    function requestBatchTotalsDecryption(uint256 batchId)
        external
        onlyProvider
        whenNotPaused
        respectCooldown(msg.sender, lastDecryptionRequestTime)
    {
        if (batchId >= batches.length) revert BatchNotOpen();
        Batch storage batch = batches[batchId];
        if (batch.open) revert BatchClosed(); // Batch must be closed

        Policy[] storage policies = batchPolicies[batchId];
        Claim[] storage claims = batchClaims[batchId];

        euint32 memory totalEncryptedCoverage = FHE.asEuint32(0);
        euint32 memory totalEncryptedPremiums = FHE.asEuint32(0);
        euint32 memory totalEncryptedClaims = FHE.asEuint32(0);

        for (uint i = 0; i < policies.length; i++) {
            totalEncryptedCoverage = totalEncryptedCoverage.add(policies[i].encryptedCoverageAmount);
            totalEncryptedPremiums = totalEncryptedPremiums.add(policies[i].encryptedPremium);
        }
        for (uint i = 0; i < claims.length; i++) {
            totalEncryptedClaims = totalEncryptedClaims.add(claims[i].encryptedClaimAmount);
        }

        bytes32[] memory cts = new bytes32[](3);
        cts[0] = totalEncryptedCoverage.toBytes32();
        cts[1] = totalEncryptedPremiums.toBytes32();
        cts[2] = totalEncryptedClaims.toBytes32();

        bytes32 stateHash = _hashCiphertexts(cts);

        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);
        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            stateHash: stateHash,
            processed: false
        });

        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function myCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        if (decryptionContexts[requestId].processed) revert ReplayDetected();

        // Rebuild ciphertexts array in the exact same order as in requestBatchTotalsDecryption
        uint256 batchId = decryptionContexts[requestId].batchId;
        Policy[] storage policies = batchPolicies[batchId];
        Claim[] storage claims = batchClaims[batchId];

        euint32 memory currentTotalCoverage = FHE.asEuint32(0);
        euint32 memory currentTotalPremiums = FHE.asEuint32(0);
        euint32 memory currentTotalClaims = FHE.asEuint32(0);

        for (uint i = 0; i < policies.length; i++) {
            currentTotalCoverage = currentTotalCoverage.add(policies[i].encryptedCoverageAmount);
            currentTotalPremiums = currentTotalPremiums.add(policies[i].encryptedPremium);
        }
        for (uint i = 0; i < claims.length; i++) {
            currentTotalClaims = currentTotalClaims.add(claims[i].encryptedClaimAmount);
        }

        bytes32[] memory currentCts = new bytes32[](3);
        currentCts[0] = currentTotalCoverage.toBytes32();
        currentCts[1] = currentTotalPremiums.toBytes32();
        currentCts[2] = currentTotalClaims.toBytes32();

        bytes32 currentHash = _hashCiphertexts(currentCts);
        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        FHE.checkSignatures(requestId, cleartexts, proof);

        // Decode cleartexts
        uint256 totalCoverage = abi.decode(cleartexts.slice(0, 32), (uint256));
        uint256 totalPremiums = abi.decode(cleartexts.slice(32, 32), (uint256));
        uint256 totalClaims = abi.decode(cleartexts.slice(64, 32), (uint256));

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, batchId, totalCoverage, totalPremiums, totalClaims);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal view returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 cipher) internal pure {
        if (!cipher.isInitialized()) revert NotInitialized();
    }

    function _requireInitialized(euint32 cipher) internal pure {
        _initIfNeeded(cipher);
    }
}