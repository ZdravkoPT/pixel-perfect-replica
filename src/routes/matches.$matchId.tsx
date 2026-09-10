import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { getMatchDetail } from "@/lib/football.functions";
import { getMatchPrediction } from "@/lib/analytics.functions";
import { getMatchIntel } from "@/lib/intel.functions";
import { PredictionPanel } from "@/components/PredictionPanel";
import {
  InjuriesPanel,
  LineupsPanel,
  PropsPanel,
  RefereePanel,
  TeamMarketPanel,
  type IntelData,
} from "@/components/IntelPanels";
import { SquadProfilePanel } from "@/components/SquadProfilePanel";
import { HeadToHeadPanel } from "@/components/HeadToHeadPanel";
import { MatchFactsPanel } from "@/components/MatchFactsPanel";

const TABS = [
  "Overview",
  "AI Prediction",
  "Lineups",
  "Injuries",
  "Player props",
  "Corners",
  "Cards",
  "Referee",
  "Facts",
  "Odds",
  "News",
  "H2H",
] as const;

const detailQuery = (matchId: string) =>
  queryOptions({
    queryKey: ["match", matchId],
    queryFn: () => getMatchDetail({ data: { matchId } }),
  });

const predictionQueryOptions = (matchId: string) =>
  queryOptions({
    queryKey: ["match-prediction", matchId],
    queryFn: () => getMatchPrediction({ data: { matchId } }),
  });

const intelQueryOptions = (matchId: string) =>
  queryOptions({
    queryKey: ["match-intel", matchId],
    queryFn: () => getMatchIntel({ data: { matchId } }),
  });


export const Route = createFileRoute("/matches/$matchId")({
  head: () => ({
    meta: [
      { title: "Match Detail — Football Intelligence" },
      { name: "description", content: "Fixture overview, provider sources and upcoming analytics." },
      { property: "og:title", content: "Match Detail — Football Intelligence" },
      {
        property: "og:description",
        content: "Fixture overview, provider sources and upcoming analytics.",
      },
    ],
  }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(detailQuery(params.matchId));
  },
  component: MatchDetail,
});

function MatchDetail() {
  const { matchId } = Route.useParams();
  const { data } = useSuspenseQuery({
    ...detailQuery(matchId),
    // Keep score/status fresh while a fixture is in play.
    refetchInterval: 60_000,
  });
  const predictionQuery = useQuery(predictionQueryOptions(matchId));
  const intelQuery = useQuery({ ...intelQueryOptions(matchId), refetchInterval: 120_000 });

  const intel = (intelQuery.data ?? {
    lineups: [],
    officials: [],
    injuries: [],
    props: [],
    markets: [],
    refereeProfile: null,
    homeTeamId: null,
    awayTeamId: null,
  }) as unknown as IntelData;

  const match = data.match as
    | (Record<string, unknown> & {
        kickoff_at: string;
        status: string;
        home_score: number | null;
        away_score: number | null;
        league: { name: string } | null;
        home: { name: string } | null;
        away: { name: string } | null;
        venue: { name: string; city: string | null } | null;
      })
    | null;

  if (!match) {
    return (
      <AppShell title="Match not found">
        <p className="text-sm text-muted-foreground">This fixture is not in the database.</p>
      </AppShell>
    );
  }

  const kickoff = new Date(match.kickoff_at);
  const started = Date.now() >= kickoff.getTime();
  const finished = ["FINISHED", "CANCELLED", "POSTPONED"].includes(match.status);
  const inPlay = ["LIVE", "PAUSED"].includes(match.status) || (started && !finished);
  const statusLabel = ["LIVE", "PAUSED"].includes(match.status)
    ? "LIVE"
    : started && !finished
      ? "Kick-off passed · awaiting provider update"
      : match.status;
  const homeName = match.home?.name ?? "Home";
  const awayName = match.away?.name ?? "Away";


  return (
    <AppShell
      title={`${match.home?.name ?? "TBD"} vs ${match.away?.name ?? "TBD"}`}
      subtitle={`${match.league?.name ?? "Unknown league"} · ${kickoff.toLocaleString()}`}
    >
      <Tabs defaultValue="Overview">
        <TabsList className="flex h-auto flex-wrap justify-start">
          {TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="text-xs">
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="Overview" className="mt-4 space-y-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{match.home?.name ?? "TBD"}</span>
              <span className="font-mono text-2xl font-semibold tabular-nums">
                {match.home_score ?? "–"} : {match.away_score ?? "–"}
              </span>
              <span className="text-sm font-medium">{match.away?.name ?? "TBD"}</span>
            </div>
            {inPlay ? (
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                <span className="text-xs font-medium text-primary">
                  {match.status === "PAUSED" ? "Half time" : "In play"}
                  {typeof (match as { minute?: number | null }).minute === "number"
                    ? ` · ${(match as { minute?: number | null }).minute}′`
                    : ""}
                </span>
              </div>
            ) : null}
            <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <div>Status: {statusLabel}</div>
              <div>Venue: {match.venue?.name ?? "Unknown"}</div>
              <div>Kickoff: {kickoff.toLocaleString()}</div>
            </div>
          </div>


          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">Provider sources</h2>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
              {data.sources.length === 0 ? (
                <li>No provider records linked.</li>
              ) : (
                data.sources.map((source) => (
                  <li key={`${source.source_id}-${source.provider_match_id}`}>
                    <Badge variant="outline" className="mr-2">
                      {source.source_id}
                    </Badge>
                    #{source.provider_match_id} · ingested{" "}
                    {new Date(source.ingested_at).toLocaleString()}
                  </li>
                ))
              )}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="AI Prediction" className="mt-4">
          <PredictionPanel
            prediction={(predictionQuery.data?.prediction ?? null) as never}
            markets={(predictionQuery.data?.markets ?? []) as never}
            explanations={(predictionQuery.data?.explanations ?? []) as never}
            model={(predictionQuery.data?.model ?? null) as never}
            homeName={match.home?.name ?? "Home"}
            awayName={match.away?.name ?? "Away"}
          />
        </TabsContent>

        <TabsContent value="Lineups" className="mt-4 space-y-6">
          <LineupsPanel
            intel={intel}
            homeName={homeName}
            awayName={awayName}
            kickoffPassed={started}
          />

          <div>
            <h3 className="mb-2 text-sm font-semibold">Squad profile</h3>
            <SquadProfilePanel matchId={matchId} />
          </div>
        </TabsContent>

        <TabsContent value="Injuries" className="mt-4">
          <InjuriesPanel intel={intel} homeName={homeName} awayName={awayName} />
        </TabsContent>

        <TabsContent value="Player props" className="mt-4 space-y-6">
          {["player_goals", "player_assists", "player_cards"].map((market) => (
            <div key={market}>
              <h3 className="mb-2 text-sm font-semibold capitalize">
                {market.replace("player_", "")}
              </h3>
              <PropsPanel
                intel={intel}
                market={market}
                homeName={homeName}
                awayName={awayName}
              />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="Corners" className="mt-4">
          <TeamMarketPanel intel={intel} market="corners" />
        </TabsContent>

        <TabsContent value="Cards" className="mt-4">
          <TeamMarketPanel intel={intel} market="cards" />
        </TabsContent>

        <TabsContent value="Referee" className="mt-4">
          <RefereePanel intel={intel} />
        </TabsContent>

        <TabsContent value="Facts" className="mt-4">
          <MatchFactsPanel matchId={matchId} homeName={homeName} awayName={awayName} />
        </TabsContent>

        <TabsContent value="H2H" className="mt-4">
          <HeadToHeadPanel matchId={matchId} />
        </TabsContent>

        {(["Odds", "News"] as const).map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4">
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {tab} arrives in a later phase.
            </div>
          </TabsContent>
        ))}


      </Tabs>
    </AppShell>
  );
}
