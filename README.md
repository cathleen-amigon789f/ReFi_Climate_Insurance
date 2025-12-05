# ReFi Climate Insurance Protocol

A ReFi protocol that leverages **Zama's Fully Homomorphic Encryption technology** to offer FHE-encrypted, community-based insurance solutions for climate disasters. This decentralized insurance protocol is uniquely designed to protect vulnerable communities, such as farmers and coastal residents, who are disproportionately affected by climate change.

## Addressing the Climate Crisis

In the face of escalating climate disasters, communities often find themselves at a loss when it comes to financial protection. Traditional insurance models can be inaccessible or biased, leaving many without the necessary support during critical times. Vulnerable groups, including small farmers and coastal inhabitants, require a solution that is not only equitable but also respects their privacy. The ReFi Climate Insurance Protocol addresses this urgent need by providing a transparent and accessible insurance system.

## The Power of FHE

**Fully Homomorphic Encryption (FHE)** plays a vital role in solving this problem by allowing sensitive data, such as insurance policies and claims, to be encrypted while still being processed by the protocol. This ensures that privacy is maintained throughout the entire insurance process. Implemented using Zama's open-source libraries, such as **Concrete** and the **zama-fhe SDK**, our protocol guarantees the confidentiality of both policyholders and the claims mechanism, making it a pioneering solution in climate finance.

## Core Features

- **FHE-Encrypted Policies and Claims**: All insurance policies and claims are securely encrypted, ensuring that only authorized parties can access the relevant information.
- **Community-Focused Access**: Designed to be inclusive, our protocol provides affordable climate insurance to marginalized communities.
- **Global DAO Oversight**: A decentralized autonomous organization (DAO) manages the protocol, ensuring transparency, governance, and community involvement.
- **Insurance Browsing and Claim Application**: Users can easily browse available insurance products and submit claims—all within a secure environment.

## Technology Stack

- **Zama SDK** (Concrete, TFHE-rs)
- **Solidity** for smart contract development
- **Node.js** for backend services
- **Hardhat** for Ethereum development
- **IPFS** for decentralized content storage

## Directory Structure

```
ReFi_Climate_Insurance/
├── contracts/
│   └── ReFi_Climate_Insurance.sol
├── scripts/
├── test/
├── package.json
└── hardhat.config.js
```

## Getting Started

To set up the ReFi Climate Insurance Protocol on your local machine, follow these steps:

1. Ensure you have **Node.js** installed on your machine. If not, visit the official Node.js website to download and install it.
   
2. Ensure you install **Hardhat**. Install it globally using the following command:
   ```bash
   npm install --global hardhat
   ```

3. Download the project files and navigate to the project directory in your terminal.

4. Run the following command to install the required dependencies, which will include Zama's FHE libraries:
   ```bash
   npm install
   ```

Please note: **Do not attempt to use `git clone` or any URLs** to access the project repository directly.

## Building and Running the Protocol

After completing the installation, you can build and run the protocol using the following commands:

1. **Compile the Contracts**:
   ```bash
   npx hardhat compile
   ```

2. **Run Tests**:
   ```bash
   npx hardhat test
   ```

3. **Deploy the Contracts** (ensure your environment is properly set up for deployment):
   ```bash
   npx hardhat run scripts/deploy.js --network <network_name>
   ```

## Example Usage

Here is a demo snippet showcasing how to create an insurance policy using the protocol:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ReFi_Climate_Insurance.sol";

contract InsuranceDemo {
    ReFi_Climate_Insurance private insurance;

    constructor(address _insuranceAddress) {
        insurance = ReFi_Climate_Insurance(_insuranceAddress);
    }

    function createPolicy(string memory policyDetails) public {
        insurance.createPolicy(policyDetails); // FHE-encrypted
    }

    function submitClaim(uint256 policyId, string memory claimDetails) public {
        insurance.submitClaim(policyId, claimDetails); // FHE-encrypted
    }
}
```

## Acknowledgements

### Powered by Zama

We extend our heartfelt gratitude to the Zama team for their pioneering work and open-source tools that empower developers to create confidential blockchain applications. Without their innovative Fully Homomorphic Encryption technologies, the ReFi Climate Insurance Protocol would not be possible. Their commitment to enhancing privacy and security in decentralized finance is truly commendable.

---

By choosing the ReFi Climate Insurance Protocol, you're not just adopting a robust insurance model; you're actively participating in a movement towards equitable solutions for climate resilience.
