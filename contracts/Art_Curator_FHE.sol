pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ArtCuratorFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error InvalidBatch();
    error InvalidArgument();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidSignature();

    struct Artist {
        euint32 potential;
        bool exists;
    }

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    struct Batch {
        bool isOpen;
        uint256 totalArtists;
    }

    mapping(uint256 => mapping(uint256 => Artist)) public encryptedArtists;
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => DecryptionContext) public decryptionContexts;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;
    mapping(address => bool) public isProvider;

    address public owner;
    bool public paused;
    uint256 public cooldownSeconds;
    uint256 public currentBatchId;
    uint256 public constant BATCH_LIMIT = 100;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address account);
    event Unpaused(address account);
    event CooldownSet(uint256 oldCooldown, uint256 newCooldown);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event ArtistSubmitted(address indexed provider, uint256 indexed batchId, uint256 artistId, bytes32 potentialCt);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256[] artistPotentials);

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

    modifier submissionRateLimited() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier decryptionRateLimited() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        cooldownSeconds = 30; // Default cooldown
        currentBatchId = 1;
        _openBatch(currentBatchId);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (provider == address(0)) revert InvalidArgument();
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        if (provider == address(0)) revert InvalidArgument();
        isProvider[provider] = false;
        emit ProviderRemoved(provider);
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setCooldown(uint256 newCooldownSeconds) external onlyOwner {
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSet(oldCooldown, newCooldown);
    }

    function openBatch() external onlyOwner {
        currentBatchId++;
        _openBatch(currentBatchId);
    }

    function closeBatch(uint256 batchId) external onlyOwner {
        if (!batches[batchId].isOpen || batchId > currentBatchId) revert InvalidBatch();
        batches[batchId].isOpen = false;
        emit BatchClosed(batchId);
    }

    function submitArtist(uint256 batchId, euint32 potential) external onlyProvider whenNotPaused submissionRateLimited {
        if (!batches[batchId].isOpen || batchId > currentBatchId) revert InvalidBatch();
        if (batches[batchId].totalArtists >= BATCH_LIMIT) revert InvalidBatch(); // Batch full

        uint256 artistId = batches[batchId].totalArtists + 1;
        encryptedArtists[batchId][artistId] = Artist({ potential: potential, exists: true });
        batches[batchId].totalArtists = artistId;
        lastSubmissionTime[msg.sender] = block.timestamp;

        emit ArtistSubmitted(msg.sender, batchId, artistId, FHE.toBytes32(potential));
    }

    function requestBatchDecryption(uint256 batchId) external whenNotPaused decryptionRateLimited {
        if (batchId > currentBatchId || batches[batchId].totalArtists == 0) revert InvalidBatch();

        uint256 numArtists = batches[batchId].totalArtists;
        bytes32[] memory cts = new bytes32[](numArtists);

        for (uint256 i = 0; i < numArtists; i++) {
            uint256 artistId = i + 1;
            if (!encryptedArtists[batchId][artistId].exists) revert InvalidBatch(); // Should not happen
            cts[i] = FHE.toBytes32(encryptedArtists[batchId][artistId].potential);
        }

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);
        decryptionContexts[requestId] = DecryptionContext({ batchId: batchId, stateHash: stateHash, processed: false });
        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        emit DecryptionRequested(requestId, batchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();
        // Security: Replay protection ensures this callback is processed only once.

        uint256 batchId = decryptionContexts[requestId].batchId;
        uint256 numArtists = batches[batchId].totalArtists;

        bytes32[] memory currentCts = new bytes32[](numArtists);
        for (uint256 i = 0; i < numArtists; i++) {
            uint256 artistId = i + 1;
            if (!encryptedArtists[batchId][artistId].exists) revert InvalidBatch(); // Should not happen
            currentCts[i] = FHE.toBytes32(encryptedArtists[batchId][artistId].potential);
        }

        bytes32 currentHash = _hashCiphertexts(currentCts);
        // Security: State hash verification ensures that the ciphertexts that were committed to
        // when the decryption was requested have not changed before this callback is processed.
        if (currentHash != decryptionContexts[requestId].stateHash) revert StateMismatch();

        // Security: Proof verification ensures the cleartexts are authentic and correctly decrypted
        // by the FHEVM network according to the request.
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) revert InvalidSignature();

        uint256[] memory artistPotentials = new uint256[](numArtists);
        for (uint256 i = 0; i < numArtists; i++) {
            artistPotentials[i] = abi.decode(cleartexts, (uint32));
            cleartexts = cleartexts[32:]; // Advance pointer
        }

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, batchId, artistPotentials);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _openBatch(uint256 batchId) private {
        batches[batchId] = Batch({ isOpen: true, totalArtists: 0 });
        emit BatchOpened(batchId);
    }
}