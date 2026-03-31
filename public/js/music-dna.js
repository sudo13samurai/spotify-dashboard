function renderMusicDNA(profile) {
const ctx = document.getElementById("musicDNA");

new Chart(ctx, {
type: "radar",
data: {
labels: [
"Energy",
"Danceability",
"Acousticness",
"Instrumentalness",
"Valence",
"Tempo"
],
datasets: [
{
label: "Your Music DNA",
data: [
profile.energy,
profile.danceability,
profile.acousticness,
profile.instrumentalness,
profile.valence,
profile.tempo / 200
],
borderColor: "rgba(29,185,84,1)",
backgroundColor: "rgba(29,185,84,0.2)"
}
]
},
options: {
scales: {
r: {
min: 0,
max: 1,
ticks: {
display: false
}
}
}
}
});
}
