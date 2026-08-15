// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

// TitleRegistry — ERC-3643 "lite" (perfil reduzido, um registro por plataforma).
// Captura a semantica que o LedgerPort do BESC precisa (docs/evolution/05):
//   - emissao (issueBatch) com fator e valor de face por lote (metadado on-chain);
//   - transferencia restrita a identidades whitelisted (Identity Registry embutido);
//   - freeze/unfreeze POR TITULO (status juridico congela o titulo inteiro);
//   - substituicao atomica (burn no antigo + mint no novo);
//   - ancoragem do Merkle root da trilha de auditoria (anchorAuditRoot).
// PII NUNCA vai on-chain: apenas ids opacos (bytes32), enderecos e hashes.
contract TitleRegistry {
    address public agent; // hot wallet do emissor (Gestor) — unica com poder de escrita

    // titleId (opaco) -> pausado (status juridico)
    mapping(bytes32 => bool) public paused;
    // titleId -> supply total emitido
    mapping(bytes32 => uint256) public totalSupply;
    // titleId -> wallet -> saldo
    mapping(bytes32 => mapping(address => uint256)) public balanceOf;
    // identidade whitelisted (partyId hash -> wallet -> ok)
    mapping(address => bool) public whitelisted;

    event BatchIssued(bytes32 indexed titleId, bytes32 indexed batchId, address to, uint256 amount, uint256 faceValueCents, uint32 splitFactor, bytes32 issuanceDocHash);
    event Transferred(bytes32 indexed titleId, address indexed from, address indexed to, uint256 amount, uint8 transferKind, bytes32 referenceHash);
    event TitleFrozen(bytes32 indexed titleId, uint8 reasonCode, bytes32 evidenceHash);
    event TitleUnfrozen(bytes32 indexed titleId, uint8 reasonCode, bytes32 evidenceHash);
    event Substituted(bytes32 indexed fromTitleId, bytes32 indexed toTitleId, address holder, uint256 amount, bytes32 docHash);
    event IdentityRegistered(address indexed wallet, bytes32 claimsHash);
    event IdentityRevoked(address indexed wallet, bytes32 reason);
    event AuditAnchored(bytes32 merkleRoot, uint256 fromEventId, uint256 toEventId);

    modifier onlyAgent() { require(msg.sender == agent, "not agent"); _; }

    constructor() { agent = msg.sender; }

    function registerIdentity(address wallet, bytes32 claimsHash) external onlyAgent {
        whitelisted[wallet] = true;
        emit IdentityRegistered(wallet, claimsHash);
    }

    function revokeIdentity(address wallet, bytes32 reason) external onlyAgent {
        whitelisted[wallet] = false;
        emit IdentityRevoked(wallet, reason);
    }

    function issueBatch(bytes32 titleId, bytes32 batchId, address to, uint256 amount, uint256 faceValueCents, uint32 splitFactor, bytes32 issuanceDocHash) external onlyAgent {
        require(!paused[titleId], "title paused");
        totalSupply[titleId] += amount;
        balanceOf[titleId][to] += amount;
        emit BatchIssued(titleId, batchId, to, amount, faceValueCents, splitFactor, issuanceDocHash);
    }

    function transfer(bytes32 titleId, address from, address to, uint256 amount, uint8 transferKind, bytes32 referenceHash) external onlyAgent {
        require(!paused[titleId], "title frozen");
        require(whitelisted[to], "recipient not whitelisted");
        require(balanceOf[titleId][from] >= amount, "insufficient");
        balanceOf[titleId][from] -= amount;
        balanceOf[titleId][to] += amount;
        emit Transferred(titleId, from, to, amount, transferKind, referenceHash);
    }

    function freezeTitle(bytes32 titleId, uint8 reasonCode, bytes32 evidenceHash) external onlyAgent {
        paused[titleId] = true;
        emit TitleFrozen(titleId, reasonCode, evidenceHash);
    }

    function unfreezeTitle(bytes32 titleId, uint8 reasonCode, bytes32 evidenceHash) external onlyAgent {
        paused[titleId] = false;
        emit TitleUnfrozen(titleId, reasonCode, evidenceHash);
    }

    // burn no titulo antigo + mint no novo (substituicao atomica)
    function substitute(bytes32 fromTitleId, bytes32 toTitleId, address holder, uint256 burnAmount, uint256 mintAmount, bytes32 docHash) external onlyAgent {
        require(balanceOf[fromTitleId][holder] >= burnAmount, "insufficient burn");
        balanceOf[fromTitleId][holder] -= burnAmount;
        totalSupply[fromTitleId] -= burnAmount;
        balanceOf[toTitleId][holder] += mintAmount;
        totalSupply[toTitleId] += mintAmount;
        emit Substituted(fromTitleId, toTitleId, holder, mintAmount, docHash);
    }

    function anchorAuditRoot(bytes32 merkleRoot, uint256 fromEventId, uint256 toEventId) external onlyAgent {
        emit AuditAnchored(merkleRoot, fromEventId, toEventId);
    }
}
