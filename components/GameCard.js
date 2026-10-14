import GameCardContent from "@/components/GameCardContent";
import { gameImageUrl } from "@/lib/supabase";

export default function GameCard({ game, horizonPlusGameIds = null, ...props }) {
  return <GameCardContent {...props} game={game}
    image={gameImageUrl(game.image_path || game.source_image_url)}
    isHorizonPlus={Boolean(horizonPlusGameIds?.has(game.id))} renderedAt={Date.now()} />;
}
