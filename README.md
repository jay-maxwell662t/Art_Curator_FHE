# FHE-based Art Curation Game 🎨

Dive into the world of art curation with **Art Curation Game**, where players step into the role of an art curator tasked with discovering and signing undiscovered artists from an FHE-encrypted pool. This unique gaming experience is powered by **Zama's Fully Homomorphic Encryption technology**, ensuring that both player decisions and artist potential values remain confidential while providing an engaging and strategic gameplay environment.

## The Challenge of Art Curation

In the evolving landscape of the art market, finding and curating talent is fraught with uncertainty and risk. Curators often struggle to evaluate the potential of undiscovered artists due to the unreliability of available metrics and subjective biases. Moreover, the need for confidentiality during the curation process is paramount, as revealing too much about an artist's potential can lead to market manipulation and adverse competitive behaviors.

## FHE: The Secret Behind the Success

The **Art Curation Game** employs Zama’s cutting-edge Fully Homomorphic Encryption (FHE) to tackle these challenges head-on. By leveraging Zama's open-source libraries like **Concrete** and **TFHE-rs**, the game securely encrypts artists' potential values. This allows players to make strategic decisions without ever exposing sensitive data. Players can confidently explore the hidden talents of artists, enhancing their curation experience while maintaining the integrity of the artistic ecosystem.

## Core Features 🌟

- **Encrypted Artist Potential Values**: Each artist's potential is encrypted using FHE, ensuring confidentiality and fair play.
- **Dynamic Decision Making**: Players analyze and decide which artists to sign and nurture, simulating real-world art market challenges.
- **Gamified Experience**: Explore the thrill of art curation in a fun and engaging way, with elements that mimic market dynamics and uncertainty.
- **NFT Integration**: The game features a unique NFT component, allowing players to collect and trade virtual artworks, enhancing the game's value and replayability.
- **Virtual Gallery Management**: Manage your own gallery, showcasing the artists you have discovered and signed, complete with an interactive management interface.

## Technology Stack 🛠️

- **Zama SDK**: Utilizing Zama's FHE libraries (Concrete, TFHE-rs) for secure computations.
- **Node.js**: For building the backend and serving game logic.
- **Hardhat/Foundry**: Development environment for Ethereum smart contracts.
- **Solidity**: The programming language for writing the smart contracts.
- **Web3.js**: For interacting with the Ethereum blockchain.

## Directory Structure 📁

```
/Art_Curator_FHE
│
├── contracts
│   └── Art_Curator_FHE.sol
│
├── src
│   ├── index.js
│   └── gameLogic.js
│
├── tests
│   └── ArtCurationGame.test.js
│
├── package.json
└── hardhat.config.js
```

## Installation Instructions 🛠️

1. **Prerequisites**: Ensure you have Node.js (v14 or above) and npm installed on your machine.
2. **Project Setup**:
   - Navigate to your project directory.
   - Run the following command to install the necessary dependencies:
     ```bash
     npm install
     ```
     This will also fetch the required Zama FHE libraries.
   
3. **Configure Your Environment**: Set up your environment variables as needed for the game.

## Compiling & Running the Game 🚀

To compile the smart contracts, execute:

```bash
npx hardhat compile
```

To run the tests and ensure everything is functioning correctly, execute:

```bash
npx hardhat test
```

Finally, to start the game and interact with the smart contracts, use:

```bash
node src/index.js
```

This command will initialize the game environment, allowing you to dive into the world of art curation!

## Acknowledgements 🙏

**Powered by Zama** – A heartfelt thanks to the Zama team for their pioneering work and open-source tools, which have made it possible to create confidential blockchain applications like the **Art Curation Game**. Your innovations in FHE technology are transforming how sensitive data is handled in the digital world, thereby enriching user experiences across various domains.

---

Experience art curation like never before! Join the adventure and discover hidden artistic talent while ensuring confidentiality through innovative encryption technology. Happy curating! 🎉
