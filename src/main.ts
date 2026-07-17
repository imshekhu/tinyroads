import "./style.css";
import { Game } from "./core/Game";
import { mountInterface } from "./ui/HUD";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Tiny Roads could not find its application root.");
}

mountInterface(root);

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
if (!canvas) {
  throw new Error("Tiny Roads could not create its game canvas.");
}

const game = new Game(canvas);

if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
