# Solidity API

## SaplingRoles

Protocol level Sapling roles

### DEFAULT_ADMIN_ROLE

```solidity
bytes32 DEFAULT_ADMIN_ROLE
```

Admin of the core access control

### GOVERNANCE_ROLE

```solidity
bytes32 GOVERNANCE_ROLE
```

Protocol governance role

### PAUSER_ROLE

```solidity
bytes32 PAUSER_ROLE
```

_Pauser can be governance or an entity/bot designated as a monitor that 
     enacts a pause on emergencies or anomalies.
     
     PAUSER_ROLE is a protocol level role and should not be granted to the stakers or users. Doing so would
     give the role holder the ability to pause not just their pool, but any contract within the protocol._

