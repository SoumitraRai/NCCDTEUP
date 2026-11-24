import { route } from "@/server/http";
import { listTopPosts } from "@/modules/identity/post-accounts";
export const GET = route(({ actor }) => listTopPosts(actor));
